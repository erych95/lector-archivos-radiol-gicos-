/**
 * DICOM & NNT Sample File Generator
 * Generates standard-compliant DICOM (.dcm) and NNT Viewer (.nnt) files in memory.
 */

export function createSampleDicomFile(options: {
  fileName: string;
  patientName: string;
  patientId: string;
  modality: 'CT' | 'CBCT' | 'MR';
  studyDescription: string;
  sliceIndex: number;
  totalSlices: number;
  format: 'dicom' | 'nnt';
}): File {
  const width = 128;
  const height = 128;
  const numPixels = width * height;
  const pixelDataByteLength = numPixels * 2; // 16-bit pixels

  const buffer = new ArrayBuffer(2048 + pixelDataByteLength);
  const dataView = new DataView(buffer);
  const uint8View = new Uint8Array(buffer);

  // 1. Preamble (128 bytes zero) - already zero initialized
  // 2. DICM Prefix at 128..131
  const dicm = [0x44, 0x49, 0x43, 0x4d]; // 'DICM'
  for (let i = 0; i < 4; i++) {
    uint8View[128 + i] = dicm[i];
  }

  let offset = 132;

  const encoder = new TextEncoder();

  function writeTagString(group: number, element: number, strValue: string) {
    // Ensure even length for DICOM
    let str = strValue;
    if (str.length % 2 !== 0) str += ' ';
    const bytes = encoder.encode(str);
    
    dataView.setUint16(offset, group, true);
    dataView.setUint16(offset + 2, element, true);
    dataView.setUint32(offset + 4, bytes.length, true);
    offset += 8;

    uint8View.set(bytes, offset);
    offset += bytes.length;
  }

  function writeTagUint16(group: number, element: number, val: number) {
    dataView.setUint16(offset, group, true);
    dataView.setUint16(offset + 2, element, true);
    dataView.setUint32(offset + 4, 2, true);
    dataView.setUint16(offset + 8, val, true);
    offset += 10;
  }

  // Write DICOM Header Tags (Implicit VR Little Endian)
  writeTagString(0x0008, 0x0020, "20260806"); // Study Date
  writeTagString(0x0008, 0x0060, options.modality); // Modality
  writeTagString(0x0008, 0x1030, options.studyDescription); // Study Description
  writeTagString(0x0010, 0x0010, options.patientName); // Patient Name
  writeTagString(0x0010, 0x0020, options.patientId); // Patient ID
  
  writeTagUint16(0x0028, 0x0010, height); // Rows
  writeTagUint16(0x0028, 0x0011, width); // Columns
  writeTagUint16(0x0028, 0x0100, 16); // Bits Allocated
  writeTagUint16(0x0028, 0x0101, 12); // Bits Stored
  writeTagUint16(0x0028, 0x0102, 11); // High Bit
  writeTagUint16(0x0028, 0x0103, 0);  // Pixel Representation
  writeTagString(0x0028, 0x1050, "500"); // Window Center
  writeTagString(0x0028, 0x1051, "1200"); // Window Width

  // Write Pixel Data Tag (7FE0, 0010)
  dataView.setUint16(offset, 0x7fe0, true);
  dataView.setUint16(offset + 2, 0x0010, true);
  dataView.setUint32(offset + 4, pixelDataByteLength, true);
  offset += 8;

  const pixelDataOffset = offset;
  const sliceRatio = (options.sliceIndex + 1) / options.totalSlices;

  // Render anatomical shapes into pixel array
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let val = 0;

      if (options.modality === 'CBCT') {
        // Dental CBCT Scan pattern: Jaw arch + teeth
        const jawRadius = 40 + sliceRatio * 5;
        const archDist = Math.abs(dist - jawRadius);
        
        if (archDist < 12 && y > 35) {
          // Bone density
          val = 800 + Math.floor(Math.sin(x * 0.3) * 200);
        }
        
        // Tooth roots / enamel highlights
        const toothAngle = Math.atan2(dy, dx);
        if (archDist < 8 && Math.abs(Math.sin(toothAngle * 8)) > 0.6 && y > 38) {
          val = 1800; // Enamel high density
        }

        // Central airway space
        if (dist < 15) {
          val = 50;
        }
      } else {
        // CT Chest pattern: Rib cage + lungs
        if (dist < 55 && dist > 48) {
          // Rib cage
          val = 1000 + Math.floor(Math.sin(Math.atan2(dy, dx) * 12) * 400);
        } else if (dist <= 48 && dist > 15) {
          // Lung tissue vs mediastinum
          const lung1 = Math.sqrt((dx - 20) * (dx - 20) + dy * dy);
          const lung2 = Math.sqrt((dx + 20) * (dx + 20) + dy * dy);
          if (lung1 < 18 || lung2 < 18) {
            val = 150 + Math.floor(sliceRatio * 100); // Lungs
          } else {
            val = 400; // Soft tissue
          }
        }
      }

      dataView.setUint16(pixelDataOffset + idx * 2, Math.min(4095, Math.max(0, val)), true);
    }
  }

  const finalBlobBytes = uint8View.subarray(0, pixelDataOffset + pixelDataByteLength);
  const mimeType = options.format === 'nnt' ? 'application/x-nnt' : 'application/dicom';
  
  return new File([finalBlobBytes], options.fileName, { type: mimeType });
}
