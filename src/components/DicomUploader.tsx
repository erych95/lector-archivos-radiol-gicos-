import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, File as FileIcon, CheckCircle2, AlertCircle, X, Loader2, Image as ImageIcon, Layers, Sparkles } from 'lucide-react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';
import { createSampleDicomFile } from '../utils/dicomGenerator';

// Initialize Cornerstone WADO Image Loader
if (typeof window !== 'undefined') {
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  
  cornerstoneWADOImageLoader.configure({
    beforeSend: function(xhr: XMLHttpRequest) {
      // Add custom headers here if needed
    },
    useWebWorkers: false,
  });
}

interface FileWithProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  id: string;
  errorMessage?: string;
  thumbnailUrl?: string;
  metadata?: any;
  isAnonymized?: boolean;
}

import { DicomViewer } from './DicomViewer';
import { ErrorBoundary } from './ErrorBoundary';
import { Settings, Shield, ShieldOff, Info, Maximize2, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import JSZip from 'jszip';

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}

const DicomThumbnail: React.FC<{ file: File; id: string; className?: string }> = ({ file, id, className }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    try {
      cornerstone.enable(element);

      const imageIndex = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
      const imageId = `dicomfile:${imageIndex}`;
      
      cornerstone.loadImage(imageId).then(image => {
        cornerstone.displayImage(element, image);
      }).catch(err => {
        console.warn('Error loading DICOM/NNT thumbnail:', err);
        setHasError(true);
      });
    } catch (e) {
      setHasError(true);
    }

    return () => {
      if (element) {
        try {
          cornerstone.disable(element);
        } catch {}
      }
    };
  }, [file]);

  return (
    <div 
      ref={elementRef} 
      className={className || "w-16 h-16 bg-black rounded overflow-hidden flex-shrink-0 border border-gray-200 shadow-inner flex items-center justify-center"}
    >
      {hasError && (
        <div className="text-[10px] text-blue-400 font-mono text-center p-1">
          {file.name.toLowerCase().includes('.nnt') ? 'NNT CBCT' : 'DICOM'}
        </div>
      )}
    </div>
  );
};

export const DicomUploader: React.FC = () => {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [anonymizeEnabled, setAnonymizeEnabled] = useState(false);
  const [batchPatientId, setBatchPatientId] = useState('');
  const [batchStudyDate, setBatchStudyDate] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractMetadata = async (file: File | Blob) => {
    try {
      const buffer = await file.arrayBuffer();
      const byteArray = new Uint8Array(buffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      return {
        patientName: dataSet.string('x00100010'),
        patientId: dataSet.string('x00100020'),
        studyDate: dataSet.string('x00080020'),
        modality: dataSet.string('x00080060'),
        studyDescription: dataSet.string('x00081030'),
      };
    } catch (e) {
      console.error('Metadata extraction error:', e);
      return {};
    }
  };

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const getFallbackPatientName = (filename: string): string => {
    const clean = filename
      .replace(/^TransferNow-/i, '')
      .replace(/^WeTransfer-/i, '')
      .replace(/\.(zip|rar|7z|dcm|dicom|nnt|ima)$/i, '')
      .replace(/(TOMOGRAFIA|ESTUDIO|SCAN|CBCT|DICOM)/gi, '')
      .replace(/[-_.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean || 'PACIENTE DICOM / NNT';
  };

  const validateDicom = async (file: File | Blob): Promise<boolean> => {
    try {
      if (file.size === 0) return false;

      // DICOM files have 'DICM' at offset 128
      const buffer = await file.slice(128, 132).arrayBuffer();
      const view = new Uint8Array(buffer);
      const signature = String.fromCharCode(...view);
      if (signature === 'DICM') return true;

      const filename = file instanceof File ? file.name : '';
      if (/\.(dcm|dicom|nnt|ima|vti|nff|n3d|vol|raw|dat|img)$/i.test(filename) || !filename.includes('.')) {
        return true;
      }

      const fullBuffer = await file.slice(0, 2048).arrayBuffer();
      const byteArray = new Uint8Array(fullBuffer);
      dicomParser.parseDicom(byteArray, { untilTag: 'x00200013' });
      return true;
    } catch (e) {
      const filename = file instanceof File ? file.name : '';
      if (/\.(dcm|dicom|nnt|ima|vti|nff|n3d|vol|raw|dat|img)$/i.test(filename) || !filename.includes('.')) {
        return true;
      }
      if (file.size > 0 && !/\.(exe|dll|txt|pdf|html|png|jpg|jpeg|gif|xml|json|ini|zip|rar|7z)$/i.test(filename)) {
        return true;
      }
      return false;
    }
  };

  const simulateUpload = useCallback((fileId: string, metadata: any) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress >= 100) {
        progress = 100;
        setFiles(prev =>
          prev.map(f => (f.id === fileId ? { ...f, progress, status: 'completed', metadata } : f))
        );
        addToast("File processed successfully", "success");
        clearInterval(interval);
      } else {
        setFiles(prev =>
          prev.map(f => (f.id === fileId ? { ...f, progress, status: 'uploading' } : f))
        );
      }
    }, 400);
  }, []);

  const handleFiles = async (incomingFiles: FileList | File[]) => {
    const validFiles: { file: File; id: string; metadata: any }[] = [];
    const errors: string[] = [];

    const processFile = async (file: File) => {
      if (file.name.toLowerCase().endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(file);
          const zipEntries = Object.keys(zip.files).filter(name => {
            const zipObj = zip.files[name];
            if (zipObj.dir) return false;
            
            const fileName = name.split('/').pop() || name;
            if (!fileName || fileName.startsWith('.') || fileName === 'Thumbs.db' || fileName.toLowerCase() === 'desktop.ini') {
              return false;
            }
            if (name.includes('__MACOSX')) return false;

            // Exclude non-data executables and standard non-medical docs
            if (/\.(exe|dll|bat|cmd|msi|sys|inf|ini|html|htm|pdf|lnk)$/i.test(fileName)) {
              return false;
            }

            return true;
          });
          
          if (zipEntries.length === 0) {
            errors.push(`${file.name}: No valid files found in ZIP.`);
            return;
          }

          addToast(`Extracting ${zipEntries.length} files from ${file.name}...`, 'success');

          let extractedCount = 0;
          const fallbackPatient = getFallbackPatientName(file.name);

          for (let i = 0; i < zipEntries.length; i++) {
            const entryName = zipEntries[i];
            setZipProgress(((i + 1) / zipEntries.length) * 100);
            
            const zipFile = zip.files[entryName];
            if (zipFile.dir) continue;
            
            const fileName = entryName.split('/').pop() || entryName;

            try {
              const arrayBuffer = await zipFile.async('arraybuffer');
              if (arrayBuffer.byteLength === 0) continue;

              const dcmFile = new File([arrayBuffer], fileName, { type: 'application/dicom' });
              
              const isValid = await validateDicom(dcmFile);
              if (isValid) {
                let metadata: any = await extractMetadata(dcmFile);
                if (!metadata.patientName || metadata.patientName === 'ANONYMOUS' || metadata.patientName === 'N/A') {
                  metadata.patientName = fallbackPatient;
                }
                if (!metadata.modality) {
                  metadata.modality = 'CBCT';
                }
                if (!metadata.studyDescription) {
                  metadata.studyDescription = 'ESTUDIO CBCT / NNT';
                }

                if (anonymizeEnabled) {
                  metadata = { ...metadata, patientName: 'ANONYMIZED', patientId: 'ANONYMIZED' };
                }
                if (batchPatientId) {
                  metadata.patientId = batchPatientId;
                }
                if (batchStudyDate) {
                  metadata.studyDate = batchStudyDate;
                }
                validFiles.push({ file: dcmFile, id: Math.random().toString(36).substring(7), metadata });
                extractedCount++;
              }
            } catch (err) {
              console.warn(`Failed to extract ${entryName} from ZIP:`, err);
            }
          }

          if (extractedCount === 0) {
            errors.push(`${file.name}: Could not extract any valid DICOM / NNT files.`);
          }
        } catch (e: any) {
          console.error("ZIP read error:", e);
          errors.push(`${file.name}: Failed to read ZIP file. ${e.message || e}`);
        }
        return;
      }

      const hasValidExtension = /\.(dcm|dicom|nnt|ima|vti|nff|n3d|vol|raw|dat|img)$/i.test(file.name) || !file.name.includes('.');
      const isValid = await validateDicom(file);
      if (!isValid && !hasValidExtension) {
        errors.push(`${file.name}: File header could not be recognized as DICOM / NNT viewer format.`);
        return;
      }

      let metadata: any = await extractMetadata(file);
      if (!metadata.patientName || metadata.patientName === 'ANONYMOUS' || metadata.patientName === 'N/A') {
        metadata.patientName = getFallbackPatientName(file.name);
      }
      if (!metadata.modality) {
        metadata.modality = file.name.toLowerCase().includes('.nnt') ? 'NNT CBCT' : 'CT';
      }

      if (anonymizeEnabled) {
        metadata = {
          ...metadata,
          patientName: 'ANONYMIZED',
          patientId: 'ANONYMIZED',
        };
      }
      if (batchPatientId) {
        metadata.patientId = batchPatientId;
      }
      if (batchStudyDate) {
        metadata.studyDate = batchStudyDate;
      }

      validFiles.push({
        file,
        id: Math.random().toString(36).substring(7),
        metadata,
      });
    };

    setIsExtractingZip(true);
    setZipProgress(0);
    setUploadErrors([]);

    const fileArray = Array.from(incomingFiles);
    for (const file of fileArray) {
      await processFile(file);
    }

    setIsExtractingZip(false);

    if (errors.length > 0) {
      setUploadErrors(errors);
    }

    if (validFiles.length > 0) {
      const newFilesWithProgress: FileWithProgress[] = validFiles.map(v => ({
        file: v.file,
        progress: 100,
        status: 'completed',
        id: v.id,
        metadata: v.metadata,
        isAnonymized: anonymizeEnabled
      }));

      setFiles(prev => [...newFilesWithProgress, ...prev]);
    }
  };

  const loadSampleNntAndDicomStudy = async () => {
    setIsExtractingZip(true);
    addToast("Cargando estudio demo DICOM y NNT CBCT 3D...", "success");

    try {
      const nntFiles = [1, 2, 3].map(i => 
        createSampleDicomFile({
          fileName: `NNT_CBCT_Jaw_Slice_${i}.nnt`,
          patientName: 'PACIENTE NNT^CBCT DENTAL 3D',
          patientId: 'NNT-CBCT-2026',
          modality: 'CBCT',
          studyDescription: 'Escaneo 3D NNT Viewer (Dental CBCT)',
          sliceIndex: i - 1,
          totalSlices: 3,
          format: 'nnt'
        })
      );

      const dicomFiles = [1, 2, 3].map(i => 
        createSampleDicomFile({
          fileName: `DICOM_Chest_CT_Slice_${i}.dcm`,
          patientName: 'PACIENTE DICOM^TORAX',
          patientId: 'DCM-CT-8832',
          modality: 'CT',
          studyDescription: 'Tomografía DICOM Estándar',
          sliceIndex: i - 1,
          totalSlices: 3,
          format: 'dicom'
        })
      );

      await handleFiles([...nntFiles, ...dicomFiles]);
    } catch (err) {
      console.error('Error generating sample dataset:', err);
    } finally {
      setIsExtractingZip(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const completedFiles = files.filter(f => f.status === 'completed');
  
  const dcmFiles = completedFiles.filter(f => f.file.name.toLowerCase().endsWith('.dcm'));
  const zipFiles = completedFiles.filter(f => f.file.name.toLowerCase().endsWith('.zip'));

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const totalDcmSize = dcmFiles.reduce((sum, f) => sum + f.file.size, 0);
  const totalZipSize = zipFiles.reduce((sum, f) => sum + f.file.size, 0);
  const hasZip = zipFiles.length > 0;

  const totalPages = Math.ceil(files.length / itemsPerPage);
  const paginatedFiles = files.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [files.length, totalPages, currentPage]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      
      {/* Search / Filters Panel */}
      <div className="bg-[#121b2f] border border-[#1e293b] rounded-xl p-4 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5 space-y-1">
            <label className="text-xs font-medium text-gray-400">Search</label>
            <input 
              type="text" 
              placeholder="Narrow by description / accession..."
              className="w-full px-3 py-2 bg-[#0b1021] border border-[#1e293b] text-gray-200 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-medium text-gray-400">Body part</label>
            <select className="w-full px-3 py-2 bg-[#0b1021] border border-[#1e293b] text-gray-200 rounded text-sm focus:outline-none focus:border-blue-500 appearance-none">
              <option>Any</option>
              <option>Chest</option>
              <option>Brain</option>
              <option>Abdomen</option>
            </select>
          </div>
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-medium text-gray-400">Date range</label>
            <div className="flex items-center space-x-2">
              <input type="text" placeholder="1900" className="w-full px-3 py-2 bg-[#0b1021] border border-[#1e293b] text-gray-200 rounded text-sm focus:outline-none" />
              <span className="text-gray-500">&rarr;</span>
              <input type="text" placeholder="2026" className="w-full px-3 py-2 bg-[#0b1021] border border-[#1e293b] text-gray-200 rounded text-sm focus:outline-none" />
            </div>
          </div>
          <div className="md:col-span-1">
            <button className="w-full py-2 text-blue-400 text-sm hover:text-blue-300">Reset</button>
          </div>
        </div>
        
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 items-center text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Modality</span>
            <div className="flex gap-2">
              <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 font-medium"><span className="text-yellow-300">★</span> Featured</span>
              <span className="bg-[#1e293b] text-gray-300 px-3 py-1 rounded-full text-xs hover:bg-[#2a3a50] cursor-pointer">All studies</span>
              <span className="bg-[#1e293b] text-gray-300 px-3 py-1 rounded-full text-xs hover:bg-[#2a3a50] cursor-pointer">CT</span>
              <span className="bg-[#1e293b] text-gray-300 px-3 py-1 rounded-full text-xs hover:bg-[#2a3a50] cursor-pointer">MR</span>
              <span className="bg-[#1e293b] text-gray-300 px-3 py-1 rounded-full text-xs hover:bg-[#2a3a50] cursor-pointer">US</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Collection</span>
            <div className="flex gap-2">
              <span className="bg-[#1e293b] text-gray-300 px-3 py-1 rounded-full text-xs hover:bg-[#2a3a50] cursor-pointer">TCGA brain tumor <span className="ml-1 bg-[#0b1021] px-1 rounded text-[10px]">607</span></span>
              <span className="bg-[#1e293b] text-gray-300 px-3 py-1 rounded-full text-xs hover:bg-[#2a3a50] cursor-pointer">LIDC-IDRI lung <span className="ml-1 bg-[#0b1021] px-1 rounded text-[10px]">1.3k</span></span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-4">
        <motion.div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          animate={{
            scale: isDragging ? 1.01 : 1,
            borderColor: isDragging ? 'rgb(59, 130, 246)' : 'rgb(30, 41, 59)',
            backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : '#121b2f',
          }}
          className="relative border-2 border-dashed rounded-xl p-8 transition-colors cursor-pointer group"
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".dcm,.dicom,.nnt,.ima,.vti,.zip,*/*"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          
          {isExtractingZip ? (
            <div className="flex flex-col items-center justify-center space-y-4 text-center py-6 w-full max-w-md mx-auto">
              <div className="p-4 bg-blue-900/50 rounded-full">
                <Archive className="w-8 h-8 text-blue-400 animate-pulse" />
              </div>
              <div className="space-y-2 w-full px-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-300">
                    Extracting ZIP contents...
                  </span>
                  <span className="text-xs font-semibold text-blue-400">
                    {Math.round(zipProgress)}%
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                  <motion.div
                    className="bg-blue-500 h-2.5 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${zipProgress}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Please keep this window open
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="p-4 bg-blue-900/30 border border-blue-800/50 rounded-full group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-8 h-8 text-blue-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-300">
                  Haz clic para subir o arrastra tus archivos aquí
                </p>
                <p className="text-xs text-gray-400">
                  Compatibilidad total con archivos <span className="text-blue-400 font-semibold">DICOM (.dcm, .dicom)</span> y <span className="text-purple-400 font-semibold">NNT Viewer (.nnt, .nntx, .ima)</span> o paquetes ZIP
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadSampleNntAndDicomStudy();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg text-xs font-semibold shadow-lg transition-all transform hover:scale-105"
                >
                  <Sparkles className="w-4 h-4" />
                  Cargar Estudio Demo (DICOM y NNT CBCT 3D)
                </button>
              </div>
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-2 gap-4 px-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400">Batch Patient ID</label>
            <input 
              type="text" 
              placeholder="e.g. PID-12345"
              value={batchPatientId}
              onChange={(e) => setBatchPatientId(e.target.value)}
              className="w-full px-3 py-2 bg-[#0b1021] border border-[#1e293b] text-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400">Batch Study Date</label>
            <input 
              type="text" 
              placeholder="e.g. 2024-01-01"
              value={batchStudyDate}
              onChange={(e) => setBatchStudyDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#0b1021] border border-[#1e293b] text-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={anonymizeEnabled}
                onChange={(e) => setAnonymizeEnabled(e.target.checked)}
              />
              <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
              <span className="ml-3 text-xs font-medium text-gray-400 flex items-center">
                {anonymizeEnabled ? <Shield className="w-3 h-3 mr-1 text-blue-400" /> : <ShieldOff className="w-3 h-3 mr-1 text-gray-500" />}
                Anonymize PHI
              </span>
            </label>
          </div>
          <p className="text-[10px] text-gray-500 italic">
            Stripping Patient Name/ID from headers
          </p>
        </div>
      </div>      {uploadErrors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-red-900/20 border border-red-500/50 rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-400">Upload Issues</h4>
              <ul className="mt-2 space-y-1">
                {uploadErrors.map((err, idx) => (
                  <li key={idx} className="text-xs text-red-300 flex items-start">
                    <span className="mr-2">&bull;</span>
                    <span className="break-words font-mono bg-red-950/50 px-1 rounded inline-block">{err}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button 
              onClick={() => setUploadErrors([])}
              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Grid of uploaded files */}
      <div className="space-y-4">
        {files.length > 0 && (
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <h3 className="text-sm font-medium text-gray-300">
              Loaded Studies ({files.length})
            </h3>
            <button
              onClick={() => setFiles([])}
              className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              Clear All
            </button>
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence initial={false}>
            {paginatedFiles.map((fileData) => (
              <motion.div
                key={fileData.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-[#121b2f] border border-[#1e293b] rounded-lg overflow-hidden flex flex-col hover:border-blue-500 transition-colors cursor-pointer group/item relative"
                onClick={() => fileData.status === 'completed' && setSelectedFileId(fileData.id)}
              >
                {fileData.status === 'uploading' ? (
                  <div className="w-full h-full flex flex-col justify-between">
                    <div className="relative w-full aspect-[4/3] bg-[#1e293b] flex items-center justify-center overflow-hidden animate-pulse">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <FileIcon className="w-10 h-10 text-gray-600" />
                        <span className="text-xs text-blue-400 font-semibold">{Math.round(fileData.progress)}%</span>
                      </div>
                    </div>
                    <div className="p-3 space-y-2 flex-1 flex flex-col justify-center">
                      <div className="h-3 bg-[#1e293b] rounded animate-pulse w-3/4"></div>
                      <div className="h-2 bg-[#1e293b] rounded animate-pulse w-1/2"></div>
                    </div>
                    <div className="h-1 bg-[#1e293b] overflow-hidden">
                      <motion.div
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${fileData.progress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
                      <DicomThumbnail file={fileData.file} id={fileData.id} className="w-full h-full object-contain" />
                      
                      {/* Modality & Format tag */}
                      <div className="absolute top-2 left-2 flex gap-1 items-center z-10">
                        {fileData.metadata?.modality && (
                          <span className="bg-blue-900/80 text-blue-100 text-[10px] px-1.5 py-0.5 rounded font-bold">
                            {fileData.metadata.modality}
                          </span>
                        )}
                        {(fileData.file.name.toLowerCase().includes('.nnt') || fileData.metadata?.modality === 'CBCT') && (
                          <span className="bg-purple-900/90 text-purple-200 text-[10px] px-1.5 py-0.5 rounded font-bold border border-purple-500/50">
                            NNT
                          </span>
                        )}
                      </div>
                      
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(fileData.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 text-gray-300 hover:text-white rounded transition-colors opacity-0 group-hover/item:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-medium text-gray-200 truncate" title={fileData.file.name}>
                        {fileData.file.name}
                      </p>
                      <p className="text-xs text-blue-400 font-medium truncate" title={fileData.metadata?.studyDescription || 'No description'}>
                        {fileData.metadata?.studyDescription || 'No description'}
                      </p>
                      
                      <div className="flex justify-between items-center text-[10px] text-gray-500 pt-2">
                        <span>{formatSize(fileData.file.size)}</span>
                        {fileData.isAnonymized && (
                          <span className="flex items-center text-emerald-400/80 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                            <Shield className="w-3 h-3 mr-1" /> Anonymized
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center mt-6 space-x-4">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 bg-[#121b2f] border border-[#1e293b] text-gray-300 rounded hover:bg-[#1e293b] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-gray-400 text-sm font-medium">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 bg-[#121b2f] border border-[#1e293b] text-gray-300 rounded hover:bg-[#1e293b] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {selectedFileId && (
        <ErrorBoundary onReset={() => setSelectedFileId(null)} title="Error en Visor DICOM / NNT">
          <DicomViewer 
            files={files.filter(f => f.status === 'completed' && !f.file.name.toLowerCase().endsWith('.zip')).map(f => ({ file: f.file, id: f.id, metadata: f.metadata }))}
            initialFileId={selectedFileId}
            onClose={() => setSelectedFileId(null)}
          />
        </ErrorBoundary>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
                toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'
              }`}
            >
              {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
