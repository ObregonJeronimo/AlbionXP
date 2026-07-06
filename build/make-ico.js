// Wraps a 256x256 PNG into a single-image ICO (PNG-in-ICO, supported since Vista).
const fs = require('fs');
const path = require('path');

const png = fs.readFileSync(path.join(__dirname, 'icon-256.png'));
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type: icon
header.writeUInt16LE(1, 4);      // count
header.writeUInt8(0, 6);         // width 256 -> 0
header.writeUInt8(0, 7);         // height 256 -> 0
header.writeUInt8(0, 8);         // palette
header.writeUInt8(0, 9);         // reserved
header.writeUInt16LE(1, 10);     // color planes
header.writeUInt16LE(32, 12);    // bpp
header.writeUInt32LE(png.length, 14); // image size
header.writeUInt32LE(22, 18);    // image offset

fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([header, png]));
console.log('icon.ico written:', png.length + 22, 'bytes');
