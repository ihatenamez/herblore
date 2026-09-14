#!/usr/bin/env node
/**
 * Minimal xlsx writer (no deps): ZIP "store" method + inline strings + formulas
 * with cached values. Used to (re)generate herblore_top8.xlsx each price cycle.
 */
import zlib from "node:zlib";

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

// ---------- ZIP (deflate via zlib) ----------
function zipStore(files) {
	// files: [{name, data: Buffer}]
	const chunks = [];
	const central = [];
	let offset = 0;
	for (const f of files) {
		const nameBuf = Buffer.from(f.name, "utf8");
		const data = f.data;
		const crc = crc32(data);
		const comp = zlib.deflateRawSync(data, { level: 9 });
		const useDeflate = comp.length < data.length;
		const payload = useDeflate ? comp : data;
		const method = useDeflate ? 8 : 0;
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version
		local.writeUInt16LE(0x0800, 6); // utf8 flag
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(0, 10); // time
		local.writeUInt16LE(0x21, 12); // date (1980-01-01)
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(payload.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);
		chunks.push(local, nameBuf, payload);
		const cd = Buffer.alloc(46);
		cd.writeUInt32LE(0x02014b50, 0);
		cd.writeUInt16LE(20, 4);
		cd.writeUInt16LE(20, 6);
		cd.writeUInt16LE(0x0800, 8);
		cd.writeUInt16LE(method, 10);
		cd.writeUInt16LE(0, 12);
		cd.writeUInt16LE(0x21, 14);
		cd.writeUInt32LE(crc, 16);
		cd.writeUInt32LE(payload.length, 20);
		cd.writeUInt32LE(data.length, 24);
		cd.writeUInt16LE(nameBuf.length, 28);
		cd.writeUInt32LE(offset, 42);
		central.push({ cd, nameBuf });
		offset += local.length + nameBuf.length + payload.length;
	}
	const cdStart = offset;
	for (const { cd, nameBuf } of central) {
		chunks.push(cd, nameBuf);
		offset += cd.length + nameBuf.length;
	}
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(central.length, 8);
	eocd.writeUInt16LE(central.length, 10);
	eocd.writeUInt32LE(offset - cdStart, 12);
	eocd.writeUInt32LE(cdStart, 16);
	chunks.push(eocd);
	return Buffer.concat(chunks);
}

// ---------- XML cell helpers ----------
const esc = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colLetter(n) {
	let s = "";
	while (n) {
		n--;
		const r = n % 26;
		s = String.fromCharCode(65 + r) + s;
		n = (n - r) / 26;
	}
	return s;
}

/** cell: {v: value, f?: formula, s?: style} */
function cellXml(ref, c) {
	if (c == null || c.v == null && !c.f) return `<c r="${ref}" s="${c?.s ?? 0}"/>`;
	const style = ` s="${c.s ?? 0}"`;
	if (c.f) {
		// formula with cached value
		if (typeof c.v === "number")
			return `<c r="${ref}"${style}><f>${esc(c.f)}</f><v>${c.v}</v></c>`;
		if (typeof c.v === "string")
			return `<c r="${ref}"${style} t="str"><f>${esc(c.f)}</f><v>${esc(c.v)}</v></c>`;
		return `<c r="${ref}"${style}><f>${esc(c.f)}</f></c>`;
	}
	if (typeof c.v === "number") return `<c r="${ref}"${style}><v>${c.v}</v></c>`;
	return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
}

function sheetXml(rows, widths) {
	const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
	out.push(
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
	);
	if (widths)
		out.push(
			"<cols>" +
				widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") +
				"</cols>",
		);
	out.push("<sheetData>");
	for (let ri = 0; ri < rows.length; ri++) {
		const cells = rows[ri]
			.map((c, ci) => cellXml(`${colLetter(ci + 1)}${ri + 1}`, c ?? { v: null }))
			.join("");
		out.push(`<row r="${ri + 1}">${cells}</row>`);
	}
	out.push("</sheetData></worksheet>");
	return Buffer.from(out.join(""), "utf8");
}

// styles: 0 default, 1 bold header, 2 coins (0;[Red]-0), 3 coins bold, 4 2-decimals, 5 gray small
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="0;[Red]-0"/>
<numFmt numFmtId="165" formatCode="0.00"/>
</numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF808080"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildXlsx(sheets) {
	// sheets: [{name, xml: Buffer}]
	const ct = [
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
		'<Default Extension="xml" ContentType="application/xml"/>',
		'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
		'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
		...sheets.map(
			(_, i) =>
				`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
		),
		"</Types>",
	].join("");
	const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
	const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`;
	const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
	return zipStore([
		{ name: "[Content_Types].xml", data: Buffer.from(ct, "utf8") },
		{ name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
		{ name: "xl/workbook.xml", data: Buffer.from(wb, "utf8") },
		{ name: "xl/_rels/workbook.xml.rels", data: Buffer.from(wbRels, "utf8") },
		{ name: "xl/styles.xml", data: Buffer.from(STYLES_XML, "utf8") },
		...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
	]);
}

export { buildXlsx, sheetXml, colLetter };
