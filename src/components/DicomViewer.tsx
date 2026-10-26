import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneMath from 'cornerstone-math';
import * as cornerstoneTools from 'cornerstone-tools';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import Hammer from 'hammerjs';
import { 
  X, ZoomIn, Hand, Sun, Maximize2, RotateCcw, 
  Ruler, Circle, Square, Type, MousePointer2, 
  RotateCw, FlipHorizontal, FlipVertical, ChevronLeft, 
  ChevronRight, LayoutGrid, List, Database, Layers,
  Play, Pause, Search, Info, Settings, User, Activity,
  PanelLeftClose, SlidersHorizontal, Eye, EyeOff,
  Undo2, Redo2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Cornerstone Tools
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneTools.init();

interface Landmark {
  id: 'S' | 'N' | 'Po' | 'Or';
  name: string;
  fullName: string;
  color: string;
  desc: string;
  x: number | null;
  y: number | null;
}

interface HistoryState {
  landmarks: Landmark[];
  photoTransform: { x: number; y: number; rotate: number; scale: number };
  radioTransform: { x: number; y: number; rotate: number; scale: number };
  photoOpacity: number;
  radiographyOpacity: number;
  showPhotoLayer: boolean;
  showRadiography: boolean;
  showTracingsLayer: boolean;
  activeAdjustLayer: 'photo' | 'radiography';
  cornerstoneToolState: any;
  activeFileId: string;
}

interface DicomViewerProps {
  files: { file: File; id: string; metadata?: any }[];
  initialFileId: string;
  onClose: () => void;
}

export const DicomViewer: React.FC<DicomViewerProps> = ({ files, initialFileId, onClose }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [activeFileId, setActiveFileId] = useState(initialFileId);
  const [activeTool, setActiveTool] = useState('Wwwc');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);
  const [viewportData, setViewportData] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCineMode, setIsCineMode] = useState(false);
  const [cineFrameRate, setCineFrameRate] = useState(25);
  const [showCineSlider, setShowCineSlider] = useState(false);

  // Cephalometric & Steiner analysis states
  const [leftSidebarTab, setLeftSidebarTab] = useState<'studies' | 'steiner' | 'layers'>('studies');
  const [landmarks, setLandmarks] = useState<Landmark[]>([
    { id: 'S', name: 'S', fullName: 'Silla (S)', color: '#a855f7', desc: 'Centro de la fosa hipofisiaria (silla turca)', x: null, y: null },
    { id: 'N', name: 'N', fullName: 'Nasion (N)', color: '#3b82f6', desc: 'Punto más anterior de la sutura frontonasal', x: null, y: null },
    { id: 'Po', name: 'Po', fullName: 'Porion (Po)', color: '#f97316', desc: 'Punto más superior del conducto auditivo externo', x: null, y: null },
    { id: 'Or', name: 'Or', fullName: 'Orbitario (Or)', color: '#06b6d4', desc: 'Punto más inferior del reborde orbitario', x: null, y: null },
  ]);
  const [activeLandmarkId, setActiveLandmarkId] = useState<'S' | 'N' | 'Po' | 'Or' | null>(null);
  const [patientGender, setPatientGender] = useState<'M' | 'F'>('F');
  const [canvasPoints, setCanvasPoints] = useState<Record<string, { x: number; y: number }>>({});
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [showRadiography, setShowRadiography] = useState(true);

  // Layering & Alignment States
  const [showPhotoLayer, setShowPhotoLayer] = useState(true);
  const [showTracingsLayer, setShowTracingsLayer] = useState(true);
  const [photoOpacity, setPhotoOpacity] = useState(0.45);
  const [radiographyOpacity, setRadiographyOpacity] = useState(0.75);
  const [photoUrl, setPhotoUrl] = useState<string>('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600');
  
  // Transform states
  const [photoTransform, setPhotoTransform] = useState({ x: 80, y: 15, rotate: -4, scale: 0.95 });
  const [radioTransform, setRadioTransform] = useState({ x: 0, y: 0, rotate: 0, scale: 1 });
  const [activeAdjustLayer, setActiveAdjustLayer] = useState<'photo' | 'radiography'>('photo');

  // History Undo/Redo States
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const isRestoringHistory = useRef(false);

  const undoableStateRef = useRef({
    landmarks,
    photoTransform,
    radioTransform,
    photoOpacity,
    radiographyOpacity,
    showPhotoLayer,
    showRadiography,
    showTracingsLayer,
    activeAdjustLayer,
    activeFileId,
  });

  // Sync ref with current values
  useEffect(() => {
    undoableStateRef.current = {
      landmarks,
      photoTransform,
      radioTransform,
      photoOpacity,
      radiographyOpacity,
      showPhotoLayer,
      showRadiography,
      showTracingsLayer,
      activeAdjustLayer,
      activeFileId,
    };
  }, [
    landmarks,
    photoTransform,
    radioTransform,
    photoOpacity,
    radiographyOpacity,
    showPhotoLayer,
    showRadiography,
    showTracingsLayer,
    activeAdjustLayer,
    activeFileId,
  ]);

  const takeHistorySnapshot = useCallback((): HistoryState => {
    const s = undoableStateRef.current;
    
    let cornerstoneState = null;
    const element = viewerRef.current;
    if (element) {
      try {
        const enabledElement = cornerstone.getEnabledElement(element);
        const imageId = enabledElement.image?.imageId;
        if (imageId) {
          const saved = cornerstoneTools.globalImageIdSpecificToolStateManager.saveImageIdToolState(imageId);
          if (saved) {
            cornerstoneState = JSON.parse(JSON.stringify(saved));
          }
        }
      } catch (e) {
        console.warn('Error saving cornerstone tool state:', e);
      }
    }

    return {
      landmarks: JSON.parse(JSON.stringify(s.landmarks)),
      photoTransform: { ...s.photoTransform },
      radioTransform: { ...s.radioTransform },
      photoOpacity: s.photoOpacity,
      radiographyOpacity: s.radiographyOpacity,
      showPhotoLayer: s.showPhotoLayer,
      showRadiography: s.showRadiography,
      showTracingsLayer: s.showTracingsLayer,
      activeAdjustLayer: s.activeAdjustLayer,
      cornerstoneToolState: cornerstoneState,
      activeFileId: s.activeFileId,
    };
  }, []);

  const pushToUndo = useCallback(() => {
    if (isRestoringHistory.current) return;
    const snap = takeHistorySnapshot();
    setUndoStack(prev => {
      const last = prev[prev.length - 1];
      if (last) {
        const keys: (keyof HistoryState)[] = [
          'photoOpacity', 'radiographyOpacity', 'showPhotoLayer', 
          'showRadiography', 'showTracingsLayer', 'activeAdjustLayer', 'activeFileId'
        ];
        const isSameMeta = keys.every(k => last[k] === snap[k]);
        const isSameLandmarks = JSON.stringify(last.landmarks) === JSON.stringify(snap.landmarks);
        const isSamePhotoTrans = JSON.stringify(last.photoTransform) === JSON.stringify(snap.photoTransform);
        const isSameRadioTrans = JSON.stringify(last.radioTransform) === JSON.stringify(snap.radioTransform);
        const isSameCornerstone = JSON.stringify(last.cornerstoneToolState) === JSON.stringify(snap.cornerstoneToolState);
        
        if (isSameMeta && isSameLandmarks && isSamePhotoTrans && isSameRadioTrans && isSameCornerstone) {
          return prev;
        }
      }
      return [...prev, snap];
    });
    setRedoStack([]);
  }, [takeHistorySnapshot]);

  const applyHistorySnapshot = useCallback((snap: HistoryState) => {
    isRestoringHistory.current = true;

    setLandmarks(snap.landmarks);
    setPhotoTransform(snap.photoTransform);
    setRadioTransform(snap.radioTransform);
    setPhotoOpacity(snap.photoOpacity);
    setRadiographyOpacity(snap.radiographyOpacity);
    setShowPhotoLayer(snap.showPhotoLayer);
    setShowRadiography(snap.showRadiography);
    setShowTracingsLayer(snap.showTracingsLayer);
    setActiveAdjustLayer(snap.activeAdjustLayer);
    
    if (snap.activeFileId !== activeFileId) {
      setActiveFileId(snap.activeFileId);
    }

    const element = viewerRef.current;
    if (element) {
      try {
        const enabledElement = cornerstone.getEnabledElement(element);
        const imageId = enabledElement.image?.imageId;
        if (imageId) {
          const toolStateManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
          toolStateManager.restoreImageIdToolState(imageId, snap.cornerstoneToolState ? JSON.parse(JSON.stringify(snap.cornerstoneToolState)) : {});
          cornerstone.updateImage(element);
        }
      } catch (e) {
        console.warn('Error restoring cornerstone tool state:', e);
      }
    }

    setTimeout(() => {
      isRestoringHistory.current = false;
    }, 50);
  }, [activeFileId]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const currentSnap = takeHistorySnapshot();
    const previousSnap = undoStack[undoStack.length - 1];
    
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, currentSnap]);
    applyHistorySnapshot(previousSnap);
  }, [undoStack, takeHistorySnapshot, applyHistorySnapshot]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const currentSnap = takeHistorySnapshot();
    const nextSnap = redoStack[redoStack.length - 1];
    
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, currentSnap]);
    applyHistorySnapshot(nextSnap);
  }, [redoStack, takeHistorySnapshot, applyHistorySnapshot]);

  const setTool = useCallback((toolName: string) => {
    setActiveTool(toolName);
    
    // Deactivate all first
    const tools = ['Wwwc', 'Pan', 'Zoom', 'Length', 'Angle', 'EllipticalRoi', 'RectangleRoi', 'Probe', 'Magnify', 'ArrowAnnotate'];
    tools.forEach(t => cornerstoneTools.setToolPassive(t));
    
    if (toolName !== 'SteinerLandmarks') {
      // Set active
      cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });
      setActiveLandmarkId(null);
    }
  }, []);

  const cycleContrastPreset = useCallback(() => {
    const element = viewerRef.current;
    if (!element) return;
    try {
      pushToUndo();
      const viewport = cornerstone.getViewport(element);
      const w = viewport.voi.windowWidth;
      let nextW = 256;
      let nextC = 128;
      let label = "Normal";

      if (w === 256) {
        nextW = 128; nextC = 128; label = "Alto Contraste";
      } else if (w === 128) {
        nextW = 400; nextC = 50; label = "Tejido Blando";
      } else if (w === 400) {
        nextW = 2000; nextC = 400; label = "Hueso";
      } else {
        nextW = 256; nextC = 128; label = "Normal";
      }

      viewport.voi.windowWidth = nextW;
      viewport.voi.windowCenter = nextC;
      cornerstone.setViewport(element, viewport);
      setHelperMessage(`Ajuste de Contraste: ${label} (W: ${nextW}, C: ${nextC})`);
    } catch (e) {
      console.warn('Error cycling contrast presets:', e);
    }
  }, [pushToUndo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if ((isCtrlOrCmd && e.key.toLowerCase() === 'y') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            e.preventDefault();
            cycleContrastPreset();
            break;
          case 'z':
            e.preventDefault();
            setTool('Zoom');
            setHelperMessage('Herramienta Zoom activada. Arrastre en la imagen para ampliar/reducir.');
            break;
          case 'p':
            e.preventDefault();
            setTool('Pan');
            setHelperMessage('Herramienta Pan activada. Arrastre para mover la imagen.');
            break;
          case 'w':
            e.preventDefault();
            setTool('Wwwc');
            setHelperMessage('Herramienta Window/Level activada. Arrastre para ajustar brillo y contraste.');
            break;
          case '1':
            e.preventDefault();
            pushToUndo();
            setShowPhotoLayer(prev => !prev);
            setHelperMessage(`Capa Imagen (Foto) ${!showPhotoLayer ? 'activada' : 'desactivada'}.`);
            break;
          case '2':
            e.preventDefault();
            pushToUndo();
            setShowRadiography(prev => !prev);
            setHelperMessage(`Capa Radiografía ${!showRadiography ? 'activada' : 'desactivada'}.`);
            break;
          case '3':
            e.preventDefault();
            pushToUndo();
            setShowTracingsLayer(prev => !prev);
            setHelperMessage(`Capa Trazos (Cefalometría) ${!showTracingsLayer ? 'activada' : 'desactivada'}.`);
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUndo, handleRedo, showPhotoLayer, showRadiography, showTracingsLayer, pushToUndo, setTool, cycleContrastPreset]);

  const handlePhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoUrl(url);
      setShowPhotoLayer(true);
    }
  }, []);

  const activeFile = files.find(f => f.id === activeFileId) || files[0];
  const currentIndex = files.findIndex(f => f.id === activeFileId) + 1;
  const totalFrames = files.length;

  const handleCinePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    try {
      // Check if element is enabled
      cornerstone.getEnabledElement(element);
      
      if (isPlaying) {
        // Re-trigger play clip with the new frame rate
        cornerstoneTools.stopClip(element);
        cornerstoneTools.playClip(element, cineFrameRate);
      } else {
        cornerstoneTools.stopClip(element);
      }
    } catch (error) {
      // Element not enabled yet, or no stack
    }
  }, [isPlaying, cineFrameRate]);

  const toggleCineMode = useCallback(() => {
    if (isCineMode) {
      setIsCineMode(false);
      setShowCineSlider(false);
      setIsPlaying(false);
    } else {
      setIsCineMode(true);
      setIsPlaying(true);
    }
  }, [isCineMode]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadImage = useCallback((file: File) => {
    const element = viewerRef.current;
    if (!element) return;
    setLoadError(null);

    try {
      const imageIndex = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
      const imageId = `dicomfile:${imageIndex}`;

      cornerstone.loadImage(imageId).then(image => {
        if (element) {
          cornerstone.displayImage(element, image);
          const viewport = cornerstone.getViewport(element);
          setViewportData(viewport);
        }
      }).catch(err => {
        console.warn('Error loading cornerstone image:', err);
        setLoadError(err?.message || 'Error al decodificar la estructura del archivo radiológico.');
      });
    } catch (err: any) {
      setLoadError(err?.message || 'Error al procesar el archivo DICOM / NNT.');
    }
  }, []);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    cornerstone.enable(element);

    // Add tools
    const tools = [
      cornerstoneTools.WwwcTool,
      cornerstoneTools.PanTool,
      cornerstoneTools.ZoomTool,
      cornerstoneTools.LengthTool,
      cornerstoneTools.AngleTool,
      cornerstoneTools.EllipticalRoiTool,
      cornerstoneTools.RectangleRoiTool,
      cornerstoneTools.ProbeTool,
      cornerstoneTools.MagnifyTool,
      cornerstoneTools.ArrowAnnotateTool,
      cornerstoneTools.EraserTool,
    ];

    tools.forEach(tool => cornerstoneTools.addTool(tool));
    cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);
    cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);
    cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });
    cornerstoneTools.setToolActive('StackScrollMouseWheel', { });

    const ids = files.map(f => {
      const index = cornerstoneWADOImageLoader.wadouri.fileManager.add(f.file);
      return `dicomfile:${index}`;
    });

    const stack = {
      currentImageIdIndex: Math.max(0, files.findIndex(f => f.id === activeFileId)),
      imageIds: ids
    };

    cornerstoneTools.addStackStateManager(element, ['stack']);
    cornerstoneTools.addToolState(element, 'stack', stack);

    cornerstone.loadImage(ids[stack.currentImageIdIndex]).then(image => {
      if (element) {
        cornerstone.displayImage(element, image);
        const viewport = cornerstone.getViewport(element);
        setViewportData(viewport);
      }
    }).catch(err => {
      console.warn('Error displaying initial DICOM frame:', err);
      setLoadError(err?.message || 'No se pudo cargar la imagen DICOM seleccionada.');
    });

    const onImageRendered = () => {
      const viewport = cornerstone.getViewport(element);
      setViewportData(viewport);
    };

    const onNewImage = () => {
      const stackState = cornerstoneTools.getToolState(element, 'stack');
      if (stackState && stackState.data && stackState.data[0]) {
        const newIndex = stackState.data[0].currentImageIdIndex;
        if (newIndex >= 0 && newIndex < files.length) {
          setActiveFileId(files[newIndex].id);
        }
      }
    };

    element.addEventListener('cornerstoneimagerendered', onImageRendered);
    element.addEventListener('cornerstonenewimage', onNewImage);

    return () => {
      element.removeEventListener('cornerstoneimagerendered', onImageRendered);
      element.removeEventListener('cornerstonenewimage', onNewImage);
      cornerstone.disable(element);
    };
  }, []);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    
    const index = files.findIndex(f => f.id === activeFileId);
    if (index === -1) return;

    const stackState = cornerstoneTools.getToolState(element, 'stack');
    if (stackState && stackState.data && stackState.data[0]) {
      const stack = stackState.data[0];
      if (stack.currentImageIdIndex !== index) {
        stack.currentImageIdIndex = index;
        cornerstone.loadImage(stack.imageIds[index]).then(image => {
          cornerstone.displayImage(element, image);
        });
      }
    }
  }, [activeFileId, files]);

  const updateCanvasCoords = useCallback(() => {
    const element = viewerRef.current;
    if (!element) return;
    try {
      const coords: Record<string, { x: number; y: number }> = {};
      landmarks.forEach(lm => {
        if (lm.x !== null && lm.y !== null) {
          const canvasPt = cornerstone.pixelToCanvas(element, { x: lm.x, y: lm.y });
          coords[lm.id] = canvasPt;
        }
      });
      setCanvasPoints(coords);
    } catch (e) {}
  }, [landmarks]);

  useEffect(() => {
    updateCanvasCoords();
  }, [viewportData, landmarks, activeFileId, updateCanvasCoords]);

  const handleViewerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const element = viewerRef.current;
    if (!element || !activeLandmarkId) return;

    try {
      const pageX = e.pageX;
      const pageY = e.pageY;
      
      // Convert to image pixel coordinates
      const pixelCoords = cornerstone.pageToPixel(element, pageX, pageY);
      
      pushToUndo();
      setLandmarks(prev => prev.map(lm => {
        if (lm.id === activeLandmarkId) {
          return { ...lm, x: Math.round(pixelCoords.x), y: Math.round(pixelCoords.y) };
        }
        return lm;
      }));

      // Find next unplaced landmark to auto-advance
      const currentIndex = landmarks.findIndex(l => l.id === activeLandmarkId);
      const remaining = [
        ...landmarks.slice(currentIndex + 1),
        ...landmarks.slice(0, currentIndex + 1)
      ];
      const nextLandmark = remaining.find(l => l.x === null && l.id !== activeLandmarkId);
      
      if (nextLandmark) {
        setActiveLandmarkId(nextLandmark.id);
        setHelperMessage(`Punto ${activeLandmarkId} colocado. Por favor, marque ${nextLandmark.fullName}.`);
      } else {
        setActiveLandmarkId(null);
        setHelperMessage('¡Todos los puntos cefalométricos han sido colocados! Verifique los resultados en el panel lateral.');
      }
    } catch (err) {
      console.warn('Error converting click to pixel coordinates:', err);
    }
  };

  const loadDemoLandmarks = () => {
    const element = viewerRef.current;
    if (!element) return;

    try {
      const enabledElement = cornerstone.getEnabledElement(element);
      const img = enabledElement.image;
      if (img) {
        const width = img.width || 512;
        const height = img.height || 512;

        pushToUndo();
        setLandmarks([
          { id: 'S', name: 'S', fullName: 'Silla (S)', color: '#a855f7', desc: 'Centro de la fosa hipofisiaria (silla turca)', x: Math.round(width * 0.44), y: Math.round(height * 0.38) },
          { id: 'N', name: 'N', fullName: 'Nasion (N)', color: '#3b82f6', desc: 'Punto más anterior de la sutura frontonasal', x: Math.round(width * 0.65), y: Math.round(height * 0.35) },
          { id: 'Po', name: 'Po', fullName: 'Porion (Po)', color: '#f97316', desc: 'Punto más superior del conducto auditivo externo', x: Math.round(width * 0.32), y: Math.round(height * 0.48) },
          { id: 'Or', name: 'Or', fullName: 'Orbitario (Or)', color: '#06b6d4', desc: 'Punto más inferior del reborde orbitario', x: Math.round(width * 0.58), y: Math.round(height * 0.46) },
        ]);
        setActiveLandmarkId(null);
        setHelperMessage('Puntos de demostración cefalométrica cargados.');
      }
    } catch (e) {
      pushToUndo();
      setLandmarks([
        { id: 'S', name: 'S', fullName: 'Silla (S)', color: '#a855f7', desc: 'Centro de la fosa hipofisiaria (silla turca)', x: 220, y: 190 },
        { id: 'N', name: 'N', fullName: 'Nasion (N)', color: '#3b82f6', desc: 'Punto más anterior de la sutura frontonasal', x: 340, y: 175 },
        { id: 'Po', name: 'Po', fullName: 'Porion (Po)', color: '#f97316', desc: 'Punto más superior del conducto auditivo externo', x: 160, y: 240 },
        { id: 'Or', name: 'Or', fullName: 'Orbitario (Or)', color: '#06b6d4', desc: 'Punto más inferior del reborde orbitario', x: 290, y: 230 },
      ]);
      setActiveLandmarkId(null);
      setHelperMessage('Puntos de demostración cefalométrica cargados por defecto.');
    }
  };

  const resetLandmarks = () => {
    pushToUndo();
    setLandmarks([
      { id: 'S', name: 'S', fullName: 'Silla (S)', color: '#a855f7', desc: 'Centro de la fosa hipofisiaria (silla turca)', x: null, y: null },
      { id: 'N', name: 'N', fullName: 'Nasion (N)', color: '#3b82f6', desc: 'Punto más anterior de la sutura frontonasal', x: null, y: null },
      { id: 'Po', name: 'Po', fullName: 'Porion (Po)', color: '#f97316', desc: 'Punto más superior del conducto auditivo externo', x: null, y: null },
      { id: 'Or', name: 'Or', fullName: 'Orbitario (Or)', color: '#06b6d4', desc: 'Punto más inferior del reborde orbitario', x: null, y: null },
    ]);
    setActiveLandmarkId('S');
    setHelperMessage('Por favor, marque la Silla (S) haciendo clic en la imagen.');
  };

  const calculateSteiner = () => {
    const S = landmarks.find(l => l.id === 'S');
    const N = landmarks.find(l => l.id === 'N');
    const Po = landmarks.find(l => l.id === 'Po');
    const Or = landmarks.find(l => l.id === 'Or');

    if (!S || !N || !Po || !Or || S.x === null || N.x === null || Po.x === null || Or.x === null) {
      return null;
    }

    let rowSpacing = 0.125; // Standard high-res default if none found
    let colSpacing = 0.125;
    const element = viewerRef.current;
    if (element) {
      try {
        const img = cornerstone.getEnabledElement(element).image;
        if (img) {
          rowSpacing = img.rowPixelSpacing || 0.125;
          colSpacing = img.columnPixelSpacing || 0.125;
        }
      } catch (e) {}
    }

    // S-N distance calculation
    const dx = (N.x - S.x) * colSpacing;
    const dy = (N.y - S.y) * rowSpacing;
    const snLength = Math.sqrt(dx * dx + dy * dy);

    // Planes slope angles (screen coords: y goes down)
    const angleSN = Math.atan2(N.y - S.y, N.x - S.x);
    const angleFH = Math.atan2(Or.y - Po.y, Or.x - Po.x);

    let angleDiff = (angleFH - angleSN) * (180 / Math.PI);
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    const snToFhAngle = Math.abs(angleDiff);

    // Interpretation reference ranges
    // S-N length: 71 +/- 3 mm (F), 76 +/- 3 mm (M)
    const refSn = patientGender === 'F' ? 71 : 76;
    let snStatus = 'Normal';
    let snColor = 'text-green-400';
    if (snLength > refSn + 3) {
      snStatus = 'Maxilares propensos a retrognatismo / Largo';
      snColor = 'text-amber-400';
    } else if (snLength < refSn - 3) {
      snStatus = 'Maxilares propensos a prognatismo / Corto';
      snColor = 'text-rose-400';
    }

    // Angle S-N to FH: 7 +/- 3 degrees
    let angleStatus = 'Normal';
    let angleColor = 'text-green-400';
    if (snToFhAngle > 10) {
      angleStatus = 'Alta inclinación (Patrón dolicofacial o divergente)';
      angleColor = 'text-amber-400';
    } else if (snToFhAngle < 4) {
      angleStatus = 'Baja inclinación (Patrón braquifacial o convergente)';
      angleColor = 'text-rose-400';
    }

    return {
      snLength,
      snToFhAngle,
      refSn,
      snStatus,
      snColor,
      angleStatus,
      angleColor,
    };
  };

  const resetView = () => {
    const element = viewerRef.current;
    if (element) cornerstone.reset(element);
  };

  const rotate = () => {
    const element = viewerRef.current;
    if (element) {
      const viewport = cornerstone.getViewport(element);
      viewport.rotation += 90;
      cornerstone.setViewport(element, viewport);
    }
  };

  const flipH = () => {
    const element = viewerRef.current;
    if (element) {
      const viewport = cornerstone.getViewport(element);
      viewport.hflip = !viewport.hflip;
      cornerstone.setViewport(element, viewport);
    }
  };

  const flipV = () => {
    const element = viewerRef.current;
    if (element) {
      const viewport = cornerstone.getViewport(element);
      viewport.vflip = !viewport.vflip;
      cornerstone.setViewport(element, viewport);
    }
  };

  const invert = () => {
    const element = viewerRef.current;
    if (element) {
      const viewport = cornerstone.getViewport(element);
      viewport.invert = !viewport.invert;
      cornerstone.setViewport(element, viewport);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0c10] flex flex-col text-gray-300 font-sans select-none overflow-hidden">
      {/* Top Header - SAGA Style */}
      <header className="h-14 bg-[#11141a] border-b border-[#1f242d] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white tracking-wider text-lg">SAGA</span>
          </div>
          
          <div className="h-8 w-px bg-[#1f242d]" />
          
          <div className="flex items-center space-x-4 text-xs font-medium">
            <div className="flex items-center space-x-2 hover:text-white cursor-pointer transition-colors">
              <Database className="w-4 h-4 text-blue-500" />
              <span>NCI Imaging Data Commons</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1 bg-[#1f242d] rounded-full px-3 py-1 text-xs">
            <User className="w-3 h-3 text-gray-500" />
            <span className="text-gray-400">Patient Mode</span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[#1f242d] rounded-full transition-colors text-gray-500 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Studies/Steiner Sidebar */}
        <motion.aside 
          initial={false}
          animate={{ width: isSidebarOpen ? 280 : 0 }}
          className="bg-[#11141a] border-r border-[#1f242d] flex flex-col overflow-hidden relative"
        >
          {/* Tab Headers */}
          <div className="flex border-b border-[#1f242d] bg-[#020617] shrink-0">
            <button 
              onClick={() => setLeftSidebarTab('studies')}
              className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                leftSidebarTab === 'studies' 
                  ? 'border-blue-500 text-blue-400 bg-[#0f172a]' 
                  : 'border-transparent text-gray-500 hover:text-gray-350'
              }`}
            >
              Estudios
            </button>
            <button 
              onClick={() => {
                setLeftSidebarTab('steiner');
                setTool('SteinerLandmarks');
                // Set active landmark to S if none are active
                const firstEmpty = landmarks.find(l => l.x === null);
                setActiveLandmarkId(firstEmpty ? firstEmpty.id : 'S');
              }}
              className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                leftSidebarTab === 'steiner' 
                  ? 'border-blue-500 text-blue-400 bg-[#0f172a]' 
                  : 'border-transparent text-gray-500 hover:text-gray-350'
              }`}
            >
              Steiner
            </button>
            <button 
              onClick={() => setLeftSidebarTab('layers')}
              className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                leftSidebarTab === 'layers' 
                  ? 'border-blue-500 text-blue-400 bg-[#0f172a]' 
                  : 'border-transparent text-gray-500 hover:text-gray-350'
              }`}
            >
              Capas
            </button>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-3 text-gray-500 hover:text-white transition-colors border-l border-[#1f242d]"
              title="Ocultar barra lateral"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {leftSidebarTab === 'studies' ? (
            <>
              <div className="p-2 flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] shrink-0">
                <button className="p-1.5 text-blue-400 hover:bg-[#1e293b] rounded transition-colors">
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
                <div className="flex bg-[#1e293b] rounded-md p-0.5">
                  <button className="p-1.5 text-gray-400 hover:text-white rounded-sm transition-colors">
                    <List className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 bg-[#3b82f6] text-white rounded-sm shadow-sm transition-colors">
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto bg-[#020617] p-1 space-y-1">
                {files.map(f => (
                  <div 
                    key={f.id}
                    onClick={() => setActiveFileId(f.id)}
                    className={`group relative p-3 border rounded-md transition-all cursor-pointer flex items-center justify-between mx-1 ${
                      activeFileId === f.id ? 'border-white bg-[#0f172a]' : 'border-transparent hover:border-blue-500/50 bg-[#0f172a]/80'
                    }`}
                  >
                    <div className="space-y-1 overflow-hidden">
                      <h4 className="text-[13px] font-bold text-white truncate">{f.metadata?.studyDate || '02-ene-2000'}</h4>
                      <p className="text-[11px] text-blue-300 truncate">{f.metadata?.studyDescription || 'NLST-LSS'}</p>
                    </div>
                    <div className="flex items-center space-x-1 text-blue-400 text-xs shrink-0 pl-2">
                      <span>0</span>
                      <ChevronLeft className="w-4 h-4" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : leftSidebarTab === 'steiner' ? (
            // Steiner Tab Content
            <div className="flex-1 flex flex-col overflow-hidden bg-[#020617] p-4 space-y-4 text-xs">
              <div className="border-b border-gray-800 pb-2">
                <h3 className="font-bold text-white text-sm mb-1 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Análisis de Steiner
                </h3>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Evaluación de la base craneal anterior (S-N) y la inclinación respecto al Plano de Frankfort (Po-Or).
                </p>
              </div>

              {/* Patient Gender Toggle & Radiography Visibility */}
              <div className="flex flex-col gap-2 bg-[#0f172a] p-2 rounded-lg border border-gray-800 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium text-[10px]">Género Ref:</span>
                  <div className="flex bg-[#1e293b] rounded-md p-0.5 text-[9px]">
                    <button 
                      onClick={() => setPatientGender('F')}
                      className={`px-2 py-1 rounded-sm font-semibold transition-all ${patientGender === 'F' ? 'bg-pink-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                      Fem (71mm)
                    </button>
                    <button 
                      onClick={() => setPatientGender('M')}
                      className={`px-2 py-1 rounded-sm font-semibold transition-all ${patientGender === 'M' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                      Masc (76mm)
                    </button>
                  </div>
                </div>

                <div className="h-px bg-gray-800/50 my-0.5" />

                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium text-[10px]">Ver Radiografía:</span>
                  <button 
                    onClick={() => setShowRadiography(!showRadiography)}
                    className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all flex items-center space-x-1.5 ${
                      showRadiography 
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30' 
                        : 'bg-gray-800 text-gray-400 border border-transparent hover:bg-gray-750'
                    }`}
                  >
                    {showRadiography ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{showRadiography ? 'Visible' : 'Oculta'}</span>
                  </button>
                </div>
              </div>

              {/* Landmarks Checklist */}
              <div className="flex-1 overflow-y-auto space-y-3 min-h-[160px] pr-0.5">
                <p className="font-bold text-gray-400 tracking-wider text-[9px] uppercase">Puntos Cefalométricos</p>
                <div className="space-y-1.5">
                  {landmarks.map(lm => {
                    const isPlaced = lm.x !== null;
                    const isActive = activeLandmarkId === lm.id;
                    return (
                      <div 
                        key={lm.id}
                        onClick={() => {
                          setTool('SteinerLandmarks');
                          setActiveLandmarkId(lm.id);
                        }}
                        className={`p-2 rounded-lg border transition-all cursor-pointer flex flex-col space-y-0.5 ${
                          isActive 
                            ? 'border-indigo-500 bg-indigo-500/10' 
                            : isPlaced 
                              ? 'border-green-500/30 bg-green-500/5' 
                              : 'border-gray-800 hover:border-gray-700 bg-gray-900/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <span 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: lm.color }}
                            />
                            <span className="font-bold text-white text-[11px]">{lm.fullName}</span>
                          </div>
                          {isPlaced ? (
                            <span className="text-[9px] text-green-400 font-mono">
                              ({lm.x}, {lm.y})px
                            </span>
                          ) : (
                            <span className="text-[9px] text-gray-500 font-medium">
                              {isActive ? 'Esperando clic...' : 'Colocar'}
                            </span>
                          )}
                        </div>
                        <p className="text-[9.5px] text-gray-500 leading-tight">{lm.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={loadDemoLandmarks}
                  className="flex-1 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold rounded-lg transition-colors text-center text-[10px]"
                >
                  Autocompletar
                </button>
                <button 
                  onClick={resetLandmarks}
                  className="flex-1 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-300 font-semibold rounded-lg transition-colors text-center text-[10px]"
                >
                  Reiniciar
                </button>
              </div>

              {/* Calculations Results */}
              <div className="shrink-0 bg-gray-900/20 border border-gray-800/40 rounded-xl p-2.5">
                {calculateSteiner() ? (
                  (() => {
                    const res = calculateSteiner()!;
                    return (
                      <div className="space-y-2">
                        <h4 className="font-bold text-white text-[10px] uppercase tracking-wider text-indigo-400">Resultados del Análisis</h4>
                        
                        <div className="space-y-0.5 border-b border-gray-800/80 pb-1.5 text-[11px]">
                          <div className="flex justify-between items-baseline">
                            <span className="text-gray-400">Longitud S-N:</span>
                            <span className="font-bold text-white font-mono">
                              {res.snLength.toFixed(1)} mm
                            </span>
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-500">
                            <span>Referencia:</span>
                            <span className="font-mono">{res.refSn} ± 3 mm</span>
                          </div>
                          <p className={`text-[10px] font-medium leading-normal mt-0.5 ${res.snColor}`}>
                            {res.snStatus}
                          </p>
                        </div>

                        <div className="space-y-0.5 text-[11px]">
                          <div className="flex justify-between items-baseline">
                            <span className="text-gray-400">Ángulo S-N a Po-Or:</span>
                            <span className="font-bold text-white font-mono">
                              {res.snToFhAngle.toFixed(1)}°
                            </span>
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-500">
                            <span>Referencia:</span>
                            <span className="font-mono">7.0° ± 3°</span>
                          </div>
                          <p className={`text-[10px] font-medium leading-normal mt-0.5 ${res.angleColor}`}>
                            {res.angleStatus}
                          </p>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center text-gray-500 py-1.5">
                    <p className="mb-0.5 font-semibold text-[11px]">Marcar 4 puntos</p>
                    <p className="text-[9.5px] leading-relaxed text-gray-600">
                      Defina los puntos S, N, Po y Or haciendo clic en el visor para computar Steiner.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Layers Tab Content
            <div className="flex-1 flex flex-col overflow-hidden bg-[#020617] p-4 space-y-4 text-xs">
              <div className="border-b border-gray-800 pb-2">
                <h3 className="font-bold text-white text-sm mb-1 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  Control de Capas
                </h3>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Superponga la fotografía del paciente con la radiografía y los trazos para analizar la adaptación de tejidos blandos.
                </p>
              </div>

              {/* Layer Sliders and Visibility */}
              <div className="space-y-3 bg-[#0f172a] p-3 rounded-xl border border-gray-800 shrink-0">
                <p className="font-bold text-gray-400 tracking-wider text-[9px] uppercase">Visibilidad y Opacidad</p>
                
                {/* Capa Imagen */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <button 
                        onClick={() => { pushToUndo(); setShowPhotoLayer(!showPhotoLayer); }}
                        className={`p-1 rounded transition-colors ${showPhotoLayer ? 'text-blue-400 hover:bg-blue-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                        title={showPhotoLayer ? "Ocultar Capa Imagen" : "Mostrar Capa Imagen"}
                      >
                        {showPhotoLayer ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <span className="font-semibold text-white text-[11px]">Capa Imagen (Foto)</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{Math.round(photoOpacity * 100)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={photoOpacity}
                    onMouseDown={pushToUndo}
                    onChange={(e) => setPhotoOpacity(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    disabled={!showPhotoLayer}
                  />
                </div>

                <div className="h-px bg-gray-800/50 my-1" />

                {/* Capa Radiografía */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <button 
                        onClick={() => { pushToUndo(); setShowRadiography(!showRadiography); }}
                        className={`p-1 rounded transition-colors ${showRadiography ? 'text-blue-400 hover:bg-blue-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                        title={showRadiography ? "Ocultar Capa Radiografía" : "Mostrar Capa Radiografía"}
                      >
                        {showRadiography ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <span className="font-semibold text-white text-[11px]">Capa Radiografía (X-Ray)</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{Math.round(radiographyOpacity * 100)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={radiographyOpacity}
                    onMouseDown={pushToUndo}
                    onChange={(e) => setRadiographyOpacity(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    disabled={!showRadiography}
                  />
                </div>

                <div className="h-px bg-gray-800/50 my-1" />

                {/* Capa Trazos */}
                <div className="flex items-center justify-between py-0.5">
                  <div className="flex items-center space-x-1.5">
                    <button 
                      onClick={() => { pushToUndo(); setShowTracingsLayer(!showTracingsLayer); }}
                      className={`p-1 rounded transition-colors ${showTracingsLayer ? 'text-indigo-400 hover:bg-indigo-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                      title={showTracingsLayer ? "Ocultar Capa Trazos" : "Mostrar Capa Trazos"}
                    >
                      {showTracingsLayer ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <span className="font-semibold text-white text-[11px]">Capa Trazos (Cefalometría)</span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${showTracingsLayer ? 'bg-indigo-500/15 text-indigo-400' : 'bg-gray-800 text-gray-500'}`}>
                    {showTracingsLayer ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>

              {/* Photo Upload & Demo controls */}
              <div className="space-y-2 bg-[#0f172a] p-3 rounded-xl border border-gray-800 shrink-0">
                <p className="font-bold text-gray-400 tracking-wider text-[9px] uppercase">Cargar Foto del Paciente</p>
                <div className="flex gap-2">
                  <label className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-center text-[10px] cursor-pointer">
                    Subir Imagen
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  <button 
                    onClick={() => {
                      setPhotoUrl('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600');
                      setShowPhotoLayer(true);
                    }}
                    className="flex-1 py-1.5 px-2 bg-gray-800 hover:bg-gray-750 border border-gray-750 text-gray-300 font-semibold rounded-lg transition-colors text-center text-[10px]"
                  >
                    Foto Demo
                  </button>
                </div>
              </div>

              {/* Active Selection Selector & Alignment controls */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 min-h-[150px]">
                <p className="font-bold text-gray-400 tracking-wider text-[9px] uppercase">Ajustar Posición y Giro</p>
                
                {/* Active Layer Toggle */}
                <div className="grid grid-cols-2 bg-[#1e293b]/60 rounded-lg p-0.5 text-[10px] border border-gray-800">
                  <button 
                    onClick={() => setActiveAdjustLayer('photo')}
                    className={`py-1.5 rounded-md font-semibold transition-all ${activeAdjustLayer === 'photo' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                    Capa Imagen
                  </button>
                  <button 
                    onClick={() => setActiveAdjustLayer('radiography')}
                    className={`py-1.5 rounded-md font-semibold transition-all ${activeAdjustLayer === 'radiography' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                    Capa Radiografía
                  </button>
                </div>

                {/* Adjustment Sliders for the selected layer */}
                {(() => {
                  const isPhoto = activeAdjustLayer === 'photo';
                  const transform = isPhoto ? photoTransform : radioTransform;
                  const setTransform = isPhoto ? setPhotoTransform : setRadioTransform;

                  const updateField = (field: 'x' | 'y' | 'rotate' | 'scale', val: number) => {
                    setTransform(prev => ({ ...prev, [field]: val }));
                  };

                  return (
                    <div className="space-y-3.5 bg-gray-900/30 p-2.5 rounded-lg border border-gray-800/40">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] text-gray-400 uppercase">
                          Modo: {isPhoto ? 'Alinear Foto' : 'Alinear Radiografía'}
                        </span>
                        <button 
                          onClick={() => {
                            pushToUndo();
                            setTransform({ x: isPhoto ? 80 : 0, y: isPhoto ? 15 : 0, rotate: isPhoto ? -4 : 0, scale: isPhoto ? 0.95 : 1 });
                          }}
                          className="text-[10px] text-blue-400 hover:text-blue-350 transition-colors font-medium"
                        >
                          Restablecer
                        </button>
                      </div>

                      {/* Translate X */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-gray-300">
                          <span>Posición X:</span>
                          <div className="flex items-center space-x-1.5">
                            <button 
                              onClick={() => { pushToUndo(); updateField('x', transform.x - 5); }}
                              className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[9px] font-bold text-gray-300"
                            >
                              -5
                            </button>
                            <span className="font-mono text-white text-[11px] font-bold w-12 text-center">
                              {transform.x > 0 ? `+${transform.x}` : transform.x}px
                            </span>
                            <button 
                              onClick={() => { pushToUndo(); updateField('x', transform.x + 5); }}
                              className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[9px] font-bold text-gray-300"
                            >
                              +5
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range"
                          min="-250"
                          max="250"
                          step="1"
                          value={transform.x}
                          onMouseDown={pushToUndo}
                          onChange={(e) => updateField('x', parseInt(e.target.value))}
                          className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* Translate Y */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-gray-300">
                          <span>Posición Y:</span>
                          <div className="flex items-center space-x-1.5">
                            <button 
                              onClick={() => { pushToUndo(); updateField('y', transform.y - 5); }}
                              className="px-1.5 py-0.5 bg-[#1f2937] hover:bg-gray-700 rounded text-[9px] font-bold text-gray-350"
                            >
                              -5
                            </button>
                            <span className="font-mono text-white text-[11px] font-bold w-12 text-center">
                              {transform.y > 0 ? `+${transform.y}` : transform.y}px
                            </span>
                            <button 
                              onClick={() => { pushToUndo(); updateField('y', transform.y + 5); }}
                              className="px-1.5 py-0.5 bg-[#1f2937] hover:bg-gray-700 rounded text-[9px] font-bold text-gray-350"
                            >
                              +5
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range"
                          min="-250"
                          max="250"
                          step="1"
                          value={transform.y}
                          onMouseDown={pushToUndo}
                          onChange={(e) => updateField('y', parseInt(e.target.value))}
                          className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* Rotation */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-gray-300">
                          <span>Girar (Ángulo):</span>
                          <div className="flex items-center space-x-1.5">
                            <button 
                              onClick={() => { pushToUndo(); updateField('rotate', transform.rotate - 1); }}
                              className="px-1.5 py-0.5 bg-[#1f2937] hover:bg-gray-700 rounded text-[9px] font-bold text-gray-350"
                            >
                              -1°
                            </button>
                            <span className="font-mono text-white text-[11px] font-bold w-12 text-center">
                              {transform.rotate.toFixed(0)}°
                            </span>
                            <button 
                              onClick={() => { pushToUndo(); updateField('rotate', transform.rotate + 1); }}
                              className="px-1.5 py-0.5 bg-[#1f2937] hover:bg-gray-700 rounded text-[9px] font-bold text-gray-350"
                            >
                              +1°
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={transform.rotate}
                          onMouseDown={pushToUndo}
                          onChange={(e) => updateField('rotate', parseInt(e.target.value))}
                          className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* Scale */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-gray-300">
                          <span>Escala / Tamaño:</span>
                          <div className="flex items-center space-x-1.5">
                            <button 
                              onClick={() => { pushToUndo(); updateField('scale', Math.max(0.1, transform.scale - 0.02)); }}
                              className="px-1.5 py-0.5 bg-[#1f2937] hover:bg-gray-700 rounded text-[9px] font-bold text-gray-350"
                            >
                              -
                            </button>
                            <span className="font-mono text-white text-[11px] font-bold w-12 text-center">
                              {transform.scale.toFixed(2)}x
                            </span>
                            <button 
                              onClick={() => { pushToUndo(); updateField('scale', Math.min(3.0, transform.scale + 0.02)); }}
                              className="px-1.5 py-0.5 bg-[#1f2937] hover:bg-gray-700 rounded text-[9px] font-bold text-gray-350"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range"
                          min="0.2"
                          max="2.5"
                          step="0.01"
                          value={transform.scale}
                          onMouseDown={pushToUndo}
                          onChange={(e) => updateField('scale', parseFloat(e.target.value))}
                          className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Keyboard Shortcuts Quick Reference */}
              <div className="space-y-2 bg-[#0c1322] p-3 rounded-xl border border-gray-800/80 shrink-0">
                <p className="font-bold text-indigo-400 tracking-wider text-[9px] uppercase flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Atajos de Teclado
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-gray-400">
                  <div className="flex justify-between items-center">
                    <span>Brillo/Contraste:</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">C</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Herramienta Zoom:</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">Z</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Herramienta Pan:</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">P</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Ajuste Manual:</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">W</kbd>
                  </div>
                  <div className="flex justify-between items-center col-span-2 border-t border-gray-800/60 pt-1.5 mt-0.5">
                    <span>Alternar Capas:</span>
                    <div className="flex gap-1">
                      <kbd className="px-1 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">1</kbd>
                      <kbd className="px-1 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">2</kbd>
                      <kbd className="px-1 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">3</kbd>
                    </div>
                  </div>
                  <div className="flex justify-between items-center col-span-2">
                    <span>Deshacer / Rehacer:</span>
                    <div className="flex gap-1">
                      <kbd className="px-1 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">Ctrl+Z</kbd>
                      <kbd className="px-1 py-0.5 bg-gray-800 text-gray-200 rounded text-[9px] font-mono border border-gray-700">Ctrl+Y</kbd>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.aside>

        {/* Viewer Center Panel */}
        <div className="flex-1 flex flex-col bg-black relative">
          {/* Main Toolbar */}
          <div className="h-12 bg-[#11141a] border-b border-[#1f242d] flex items-center justify-center space-x-1 shrink-0 px-2 overflow-x-auto no-scrollbar">
            <ToolbarButton active={activeTool === 'Wwwc'} onClick={() => setTool('Wwwc')} icon={<Sun />} label="Window/Level" />
            <ToolbarButton active={activeTool === 'Pan'} onClick={() => setTool('Pan')} icon={<Hand />} label="Pan" />
            <ToolbarButton active={activeTool === 'Zoom'} onClick={() => setTool('Zoom')} icon={<ZoomIn />} label="Zoom" />
            <div className="w-px h-6 bg-[#1f242d] mx-2" />
            <ToolbarButton active={activeTool === 'Length'} onClick={() => setTool('Length')} icon={<Ruler />} label="Length" />
            <ToolbarButton active={activeTool === 'Angle'} onClick={() => setTool('Angle')} icon={<RotateCcw />} label="Angle" />
            <ToolbarButton active={activeTool === 'EllipticalRoi'} onClick={() => setTool('EllipticalRoi')} icon={<Circle />} label="Circle" />
            <ToolbarButton active={activeTool === 'RectangleRoi'} onClick={() => setTool('RectangleRoi')} icon={<Square />} label="Rectangle" />
            <ToolbarButton active={activeTool === 'ArrowAnnotate'} onClick={() => setTool('ArrowAnnotate')} icon={<Type />} label="Annotation" />
            <ToolbarButton 
              active={activeTool === 'SteinerLandmarks'} 
              onClick={() => {
                setTool('SteinerLandmarks');
                setLeftSidebarTab('steiner');
                setIsSidebarOpen(true);
                const firstEmpty = landmarks.find(l => l.x === null);
                setActiveLandmarkId(firstEmpty ? firstEmpty.id : 'S');
              }} 
              icon={<Activity className="text-indigo-400" />} 
              label="Cefalometría Steiner" 
            />
            <ToolbarButton 
              active={!showRadiography} 
              onClick={() => { pushToUndo(); setShowRadiography(!showRadiography); }} 
              icon={showRadiography ? <Eye /> : <EyeOff className="text-amber-400" />} 
              label={showRadiography ? "Ocultar Radiografía" : "Mostrar Radiografía"} 
            />
            <div className="w-px h-6 bg-[#1f242d] mx-2" />
            
            <ToolbarButton 
              active={false} 
              onClick={handleUndo} 
              icon={<Undo2 className={undoStack.length === 0 ? "text-gray-600" : "text-blue-400"} />} 
              label={`Deshacer (Ctrl+Z) [${undoStack.length}]`} 
              disabled={undoStack.length === 0}
            />
            <ToolbarButton 
              active={false} 
              onClick={handleRedo} 
              icon={<Redo2 className={redoStack.length === 0 ? "text-gray-600" : "text-blue-400"} />} 
              label={`Rehacer (Ctrl+Y) [${redoStack.length}]`} 
              disabled={redoStack.length === 0}
            />
            <div className="w-px h-6 bg-[#1f242d] mx-2" />
            
            {/* Dropdown Menu matching the screenshot */}
            <div className="relative">
              <button 
                onClick={() => setIsMoreToolsOpen(!isMoreToolsOpen)}
                className={`p-2 rounded-md transition-colors flex items-center justify-center space-x-1 ${isMoreToolsOpen ? 'bg-[#0b1a3f] text-white' : 'text-gray-400 hover:text-white hover:bg-[#1e293b]'}`}
              >
                <Settings className="w-4 h-4" />
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              
              <AnimatePresence>
                {isMoreToolsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute right-0 top-full mt-1 w-56 bg-[#0b1a3f] border border-[#1e293b] rounded-md shadow-2xl py-1 z-50 overflow-hidden"
                  >
                    <button onClick={() => { resetView(); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <RotateCcw className="w-4 h-4 mr-3" /> Reset View
                    </button>
                    <button onClick={() => { rotate(); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <RotateCw className="w-4 h-4 mr-3" /> Girar &rarr;
                    </button>
                    <button onClick={() => { flipH(); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <FlipHorizontal className="w-4 h-4 mr-3" /> Flip Horizontal
                    </button>
                    <button onClick={() => { flipV(); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <FlipVertical className="w-4 h-4 mr-3" /> Flip Vertical
                    </button>
                    <div className="h-px w-full bg-[#1e293b] my-1" />
                    <button onClick={() => { setTool('Magnify'); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <Search className="w-4 h-4 mr-3" /> Magnify
                    </button>
                    <button onClick={() => { invert(); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <Sun className="w-4 h-4 mr-3" /> Negativo
                    </button>
                    <button onClick={() => { toggleCineMode(); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <Play className="w-4 h-4 mr-3" /> {isCineMode ? 'Stop Cine' : 'Cine Mode'}
                    </button>
                    <button onClick={() => { setShowMetadata(true); setIsMoreToolsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#1a3673] flex items-center">
                      <List className="w-4 h-4 mr-3" /> DICOM Tag Browser
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Cornerstone Stage with Stacking Layers */}
          <div className="flex-1 relative group/viewer overflow-hidden bg-[#020617]">
            {/* Layer 1: Capa Imagen (Clinical Photo Underlay) */}
            {showPhotoLayer && (
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 select-none overflow-hidden z-[2]"
                style={{ opacity: photoOpacity }}
              >
                <img 
                  src={photoUrl} 
                  alt="Capa Imagen Clínico" 
                  referrerPolicy="no-referrer"
                  className="max-h-[85%] max-w-[85%] object-contain"
                  style={{
                    transform: `translate(${photoTransform.x}px, ${photoTransform.y}px) rotate(${photoTransform.rotate}deg) scale(${photoTransform.scale})`,
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            )}

            {/* Layer 2: Capa Radiografía (Cornerstone Viewer) */}
            <div 
              className="absolute inset-0 transition-opacity duration-300 z-[1]"
              style={{
                opacity: showRadiography ? radiographyOpacity : 0,
                transform: `translate(${radioTransform.x}px, ${radioTransform.y}px) rotate(${radioTransform.rotate}deg) scale(${radioTransform.scale})`,
                transformOrigin: 'center center',
              }}
            >
              <div 
                ref={viewerRef} 
                className="w-full h-full bg-black cursor-crosshair"
                onContextMenu={e => e.preventDefault()}
              />
            </div>

            {/* Interactive click-catcher for placing landmarks (aligned with radiograph) */}
            {activeTool === 'SteinerLandmarks' && (
              <div 
                className="absolute inset-0 z-20 cursor-cell bg-transparent"
                style={{
                  transform: `translate(${radioTransform.x}px, ${radioTransform.y}px) rotate(${radioTransform.rotate}deg) scale(${radioTransform.scale})`,
                  transformOrigin: 'center center',
                }}
                onClick={handleViewerClick}
              />
            )}

            {/* Layer 3: Capa Trazos (SVG Overlay with Planes, Markers, and Anatomical curves) */}
            {showTracingsLayer && (
              <svg 
                className="absolute inset-0 pointer-events-none z-10 w-full h-full"
                style={{
                  transform: `translate(${radioTransform.x}px, ${radioTransform.y}px) rotate(${radioTransform.rotate}deg) scale(${radioTransform.scale})`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Dynamic Anatomical Tracings (Soft Tissue Face Profile, Mandible and Teeth) */}
                {canvasPoints.S && canvasPoints.N && canvasPoints.Po && canvasPoints.Or && (
                  <g className="opacity-80">
                    {(() => {
                      const S = canvasPoints.S;
                      const N = canvasPoints.N;
                      const Po = canvasPoints.Po;
                      const Or = canvasPoints.Or;

                      // Compute soft tissue profile guide points dynamically
                      const xForehead = N.x - (N.x - S.x) * 0.1;
                      const yForehead = N.y - (N.y - S.y) * 1.1;
                      
                      const xNoseTip = N.x + (N.x - S.x) * 0.52;
                      const yNoseTip = N.y + (Or.y - N.y) * 0.95;
                      
                      const xSubnasale = Or.x + (N.x - S.x) * 0.12;
                      const ySubnasale = Or.y + (Or.y - Po.y) * 0.45;
                      
                      const xUpperLip = xSubnasale + 16;
                      const yUpperLip = ySubnasale + 18;
                      
                      const xUpperCrease = xSubnasale + 8;
                      const yUpperCrease = ySubnasale + 28;
                      
                      const xLowerLip = xSubnasale + 12;
                      const yLowerLip = ySubnasale + 38;
                      
                      const xLowerCrease = xSubnasale - 2;
                      const yLowerCrease = ySubnasale + 48;
                      
                      const xPogonion = S.x + (N.x - S.x) * 0.52;
                      const yPogonion = Or.y + (Or.y - Po.y) * 2.8;
                      
                      const xMenton = S.x + (N.x - S.x) * 0.4;
                      const yMenton = Or.y + (Or.y - Po.y) * 3.3;
                      
                      const xNeck = S.x + (N.x - S.x) * 0.05;
                      const yNeck = yMenton + 15;

                      // Mandible Bone guide points
                      const mxCondyle = Po.x - 5;
                      const myCondyle = Po.y + 10;
                      
                      const mxRamus = S.x - 15;
                      const myRamus = Po.y + (Or.y - Po.y) * 2.5;
                      
                      const mxGonion = S.x - 5;
                      const myGonion = Or.y + (Or.y - Po.y) * 3.1;
                      
                      const mxMenton = S.x + (N.x - S.x) * 0.38;
                      const myMenton = Or.y + (Or.y - Po.y) * 3.25;
                      
                      const mxPogonion = S.x + (N.x - S.x) * 0.48;
                      const myPogonion = Or.y + (Or.y - Po.y) * 2.75;
                      
                      const mxAlveolar = Or.x + (N.x - S.x) * 0.08;
                      const myAlveolar = Or.y + (Or.y - Po.y) * 1.95;

                      return (
                        <>
                          {/* 1. Soft Tissue Silhouette (Yellow line) */}
                          <path 
                            d={`M ${xForehead} ${yForehead} 
                                C ${N.x - 5} ${N.y - 20}, ${N.x - 2} ${N.y - 10}, ${N.x} ${N.y}
                                C ${N.x + 10} ${N.y + 25}, ${xNoseTip - 10} ${yNoseTip - 25}, ${xNoseTip} ${yNoseTip}
                                C ${xNoseTip - 5} ${yNoseTip + 12}, ${xSubnasale + 15} ${ySubnasale - 5}, ${xSubnasale} ${ySubnasale}
                                C ${xUpperLip + 8} ${yUpperLip - 5}, ${xUpperLip + 4} ${yUpperLip + 5}, ${xUpperLip} ${yUpperLip}
                                C ${xUpperCrease + 12} ${yUpperCrease}, ${xLowerLip + 10} ${yLowerLip - 5}, ${xLowerLip} ${yLowerLip}
                                C ${xLowerCrease + 10} ${yLowerCrease}, ${xPogonion + 5} ${yPogonion - 25}, ${xPogonion} ${yPogonion}
                                C ${xPogonion} ${yPogonion + 15}, ${xMenton + 5} ${yMenton - 5}, ${xMenton} ${yMenton}
                                C ${xMenton - 25} ${yMenton}, ${xNeck} ${yNeck - 15}, ${xNeck} ${yNeck}`}
                            stroke="#fbbf24" 
                            strokeWidth="2.5" 
                            fill="none" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                            className="drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.85)]"
                          />

                          {/* 2. Mandible Bone Outline (Light Blue dashed line) */}
                          <path 
                            d={`M ${mxCondyle} ${myCondyle}
                                C ${mxCondyle + 5} ${myCondyle + 30}, ${mxRamus - 10} ${myRamus - 30}, ${mxRamus} ${myRamus}
                                C ${mxRamus + 5} ${myRamus + 25}, ${mxGonion - 10} ${myGonion - 15}, ${mxGonion} ${myGonion}
                                C ${mxGonion + 25} ${myGonion + 5}, ${mxMenton - 15} ${myMenton + 5}, ${mxMenton} ${myMenton}
                                C ${mxMenton + 15} ${myMenton - 5}, ${mxPogonion} ${myPogonion + 10}, ${mxPogonion} ${myPogonion}
                                C ${mxPogonion + 5} ${myPogonion - 15}, ${mxAlveolar} ${myAlveolar + 15}, ${mxAlveolar} ${myAlveolar}`}
                            stroke="#38bdf8" 
                            strokeWidth="2.0" 
                            fill="none" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                            strokeDasharray="4,3"
                            className="drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.8)]"
                          />

                          {/* Dental representations: Incisor schematic */}
                          <g className="opacity-65">
                            {/* Upper Incisor */}
                            <line 
                              x1={xSubnasale + 4} 
                              y1={ySubnasale + 10} 
                              x2={xSubnasale - 4} 
                              y2={ySubnasale + 25} 
                              stroke="#ffffff" 
                              strokeWidth="4" 
                              strokeLinecap="round"
                            />
                            {/* Lower Incisor */}
                            <line 
                              x1={xSubnasale - 5} 
                              y1={ySubnasale + 26} 
                              x2={xSubnasale + 1} 
                              y2={ySubnasale + 38} 
                              stroke="#ffffff" 
                              strokeWidth="4" 
                              strokeLinecap="round"
                            />
                          </g>

                          {/* Text labels */}
                          <text 
                            x={xNoseTip + 12} 
                            y={yNoseTip} 
                            fill="#fbbf24" 
                            fontSize="8.5" 
                            fontWeight="bold" 
                            className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
                          >
                            Perfil Blando (Tejidos)
                          </text>
                          <text 
                            x={mxGonion + 12} 
                            y={myGonion - 10} 
                            fill="#38bdf8" 
                            fontSize="8.5" 
                            fontWeight="bold" 
                            className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
                          >
                            Mandíbula
                          </text>
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* S-N Line (Sella-Nasion) */}
                {canvasPoints.S && canvasPoints.N && (
                  <g>
                    <line 
                      x1={canvasPoints.S.x} 
                      y1={canvasPoints.S.y} 
                      x2={canvasPoints.N.x} 
                      y2={canvasPoints.N.y} 
                      stroke="#a855f7" 
                      strokeWidth="2.5" 
                      strokeDasharray="4,2"
                    />
                    <text 
                      x={(canvasPoints.S.x + canvasPoints.N.x) / 2} 
                      y={(canvasPoints.S.y + canvasPoints.N.y) / 2 - 10} 
                      fill="#c084fc" 
                      fontSize="9" 
                      fontWeight="semibold" 
                      textAnchor="middle"
                      className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] font-sans"
                    >
                      Plano S-N
                    </text>
                  </g>
                )}

                {/* Po-Or Line (Frankfort Horizontal Plane) */}
                {canvasPoints.Po && canvasPoints.Or && (
                  <g>
                    <line 
                      x1={canvasPoints.Po.x} 
                      y1={canvasPoints.Po.y} 
                      x2={canvasPoints.Or.x} 
                      y2={canvasPoints.Or.y} 
                      stroke="#f97316" 
                      strokeWidth="2.5" 
                      strokeDasharray="4,2"
                    />
                    <text 
                      x={(canvasPoints.Po.x + canvasPoints.Or.x) / 2} 
                      y={(canvasPoints.Po.y + canvasPoints.Or.y) / 2 - 10} 
                      fill="#fdba74" 
                      fontSize="9" 
                      fontWeight="semibold" 
                      textAnchor="middle"
                      className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] font-sans"
                    >
                      Plano FH (Frankfort)
                    </text>
                  </g>
                )}

                {/* Angle arc representation if everything is placed */}
                {canvasPoints.S && canvasPoints.N && canvasPoints.Po && canvasPoints.Or && (
                  <g className="opacity-80">
                    {/* Drawing connecting indicators */}
                    <line 
                      x1={canvasPoints.S.x} 
                      y1={canvasPoints.S.y} 
                      x2={canvasPoints.Po.x} 
                      y2={canvasPoints.Po.y} 
                      stroke="#475569" 
                      strokeWidth="1" 
                      strokeDasharray="2,4"
                    />
                  </g>
                )}

                {/* Drawn Points and labels */}
                {landmarks.map(lm => {
                  const pt = canvasPoints[lm.id];
                  if (!pt) return null;
                  const isActive = activeLandmarkId === lm.id;
                  return (
                    <g key={lm.id} className="transition-all duration-150">
                      {/* Shadow/Glow effect */}
                      <circle 
                        cx={pt.x} 
                        cy={pt.y} 
                        r={isActive ? "10" : "7"} 
                        fill="none" 
                        stroke={lm.color} 
                        strokeWidth="1.5" 
                        className="opacity-40 animate-ping duration-1000"
                      />
                      <circle 
                        cx={pt.x} 
                        cy={pt.y} 
                        r={isActive ? "7" : "5.5"} 
                        fill={lm.color} 
                        stroke="#ffffff" 
                        strokeWidth="1.5"
                        className="shadow-md"
                      />
                      <text 
                        x={pt.x + 9} 
                        y={pt.y - 9} 
                        fill={lm.color} 
                        fontSize="11" 
                        fontWeight="bold" 
                        fontFamily="monospace"
                        className="drop-shadow-[0_1.5px_2px_rgba(0,0,0,1)] select-none"
                      >
                        {lm.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Steiner guide floating instructions banner */}
            {activeTool === 'SteinerLandmarks' && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#0f172a]/90 border border-indigo-500/30 text-white px-4 py-2 rounded-xl text-xs flex items-center space-x-2.5 shadow-2xl backdrop-blur-md max-w-sm text-center animate-in fade-in slide-in-from-top-3 duration-200">
                <Activity className="w-4 h-4 text-indigo-400 shrink-0 animate-pulse" />
                <span className="font-semibold text-[10.5px]">
                  {helperMessage || `Marcación Cefalométrica: Haga clic para colocar Silla (S)`}
                </span>
              </div>
            )}
            
            {loadError && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl max-w-md text-red-200 shadow-xl">
                  <h4 className="font-semibold text-white mb-2 flex items-center justify-center space-x-2">
                    <span>Atención: Error de decodificación</span>
                  </h4>
                  <p className="text-xs text-red-300 mb-4">{loadError}</p>
                  <button
                    onClick={() => {
                      setLoadError(null);
                      if (activeFile) loadImage(activeFile.file);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium transition-colors"
                  >
                    Reintentar cargar corte
                  </button>
                </div>
              </div>
            )}
            
            {/* Corner Overlays - Professional Style */}
            <div className="absolute top-4 left-4 pointer-events-none text-blue-500 font-mono text-xs space-y-1 bg-black/40 p-2 rounded backdrop-blur-sm">
              <div className="flex items-center space-x-2">
                <Activity className="w-3 h-3" />
                <span className="font-bold">{activeFile.metadata?.modality || 'CT'}</span>
              </div>
              <p className="text-white">{activeFile.metadata?.patientName || 'ANONYMOUS'}</p>
              <p className="text-gray-400 text-[10px]">{activeFile.metadata?.patientId || 'ID: 000-00-0000'}</p>
            </div>

            <div className="absolute top-4 right-4 pointer-events-none text-right font-mono text-[10px] text-gray-400 bg-black/40 p-2 rounded backdrop-blur-sm">
              <p className="text-white font-bold">{activeFile.metadata?.studyDate || '01-JAN-2024'}</p>
              <p>{activeFile.metadata?.studyDescription || 'STUDY DESCRIPTION'}</p>
            </div>

            <div className="absolute bottom-4 left-4 pointer-events-none font-mono text-[10px] text-blue-500 bg-black/40 p-2 rounded backdrop-blur-sm">
              <p>W: {Math.round(viewportData?.voi?.windowWidth || 0)} L: {Math.round(viewportData?.voi?.windowCenter || 0)}</p>
              <p>ZOOM: {(viewportData?.scale || 1).toFixed(2)}x</p>
            </div>

            <div className="absolute bottom-4 right-4 pointer-events-none font-mono text-[10px] text-gray-400 bg-black/40 p-2 rounded backdrop-blur-sm">
              <p>I: {currentIndex} ({currentIndex}/{totalFrames})</p>
              <p className="text-blue-500">SAGA VIEWER V1.0</p>
            </div>

            {/* Cine Mode Control Panel */}
            {isCineMode && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center z-50">
                <div className="bg-[#0b1021] border border-[#1f2940] rounded-lg p-2 flex items-center shadow-xl">
                  <button 
                    onClick={handleCinePlayPause}
                    className="p-1 text-blue-500 hover:text-blue-400 focus:outline-none"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                  </button>
                  <div className="h-6 w-px bg-[#1f2940] mx-2"></div>
                  
                  <div 
                    className="flex items-center space-x-2 px-3 py-1 bg-[#151b2e] border border-[#1f2940] rounded-md cursor-pointer hover:bg-[#1a233a] transition-colors"
                    onClick={() => setShowCineSlider(!showCineSlider)}
                  >
                    <button 
                      className="text-blue-500 hover:text-blue-400 focus:outline-none"
                      onClick={(e) => { e.stopPropagation(); setCineFrameRate(Math.max(1, cineFrameRate - 1)); }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-white font-mono text-sm font-medium w-16 text-center">
                      {cineFrameRate} <span className="text-blue-500 text-xs">FPS</span>
                    </span>
                    <button 
                      className="text-blue-500 hover:text-blue-400 focus:outline-none"
                      onClick={(e) => { e.stopPropagation(); setCineFrameRate(Math.min(60, cineFrameRate + 1)); }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="h-6 w-px bg-[#1f2940] mx-2"></div>
                  <button 
                    onClick={toggleCineMode}
                    className="p-1 text-blue-500 hover:text-blue-400 focus:outline-none"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Slider Popover */}
                {showCineSlider && (
                  <div className="mt-2 bg-[#0b1021] border border-[#1f2940] rounded-lg p-4 w-full shadow-xl">
                    <input 
                      type="range" 
                      min="1" 
                      max="60" 
                      value={cineFrameRate} 
                      onChange={(e) => setCineFrameRate(parseInt(e.target.value, 10))}
                      className="w-full accent-blue-500 h-1 bg-[#1f2940] rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Sidebar Toggle Button */}
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="absolute left-0 top-1/2 -translate-y-1/2 bg-[#11141a] border border-[#1f242d] border-l-0 p-1 rounded-r text-gray-500 hover:text-white transition-colors"
            >
              {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Right Sidebar - Tools Menu */}
        <div className="w-14 bg-[#11141a] border-l border-[#1f242d] flex flex-col items-center py-4 space-y-4 shrink-0">
          <RightBarButton onClick={toggleCineMode} icon={<Play />} label={isCineMode ? "Stop" : "Cine"} active={isCineMode} />
          <RightBarButton icon={<Search />} label="Search" />
          <RightBarButton onClick={() => setShowMetadata(!showMetadata)} icon={<Info />} label="Tags" active={showMetadata} />
          <div className="flex-1" />
          <RightBarButton icon={<Settings />} label="Config" />
        </div>
      </div>

      {/* Metadata Panel Overlay */}
      <AnimatePresence>
        {showMetadata && (
          <motion.div
            initial={{ x: 300 }}
            animate={{ x: 0 }}
            exit={{ x: 300 }}
            className="absolute top-14 bottom-0 right-14 w-80 bg-[#11141a] border-l border-[#1f242d] z-40 p-6 shadow-2xl overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-bold text-white tracking-widest uppercase">DICOM Tag Browser</h3>
              <button onClick={() => setShowMetadata(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="space-y-6">
              <MetadataGroup label="Patient Info">
                <MetadataItem tag="(0010,0010)" label="Name" value={activeFile.metadata?.patientName || 'N/A'} />
                <MetadataItem tag="(0010,0020)" label="ID" value={activeFile.metadata?.patientId || 'N/A'} />
              </MetadataGroup>
              
              <MetadataGroup label="Study Info">
                <MetadataItem tag="(0008,0020)" label="Study Date" value={activeFile.metadata?.studyDate || 'N/A'} />
                <MetadataItem tag="(0008,0060)" label="Modality" value={activeFile.metadata?.modality || 'N/A'} />
                <MetadataItem tag="(0008,1030)" label="Study Desc" value={activeFile.metadata?.studyDescription || 'N/A'} />
              </MetadataGroup>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ToolbarButton: React.FC<{ 
  active: boolean; 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string; 
  disabled?: boolean; 
}> = ({ active, onClick, icon, label, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
      disabled 
        ? 'opacity-30 cursor-not-allowed text-gray-700 bg-transparent' 
        : active 
          ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]' 
          : 'text-gray-500 hover:text-gray-300 hover:bg-[#1f242d]'
    }`}
  >
    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' }) : icon}
  </button>
);

const RightBarButton: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; active?: boolean }> = ({ icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    title={label}
    className={`p-2 rounded-lg transition-colors ${
      active ? 'bg-blue-600/20 text-blue-500' : 'text-gray-500 hover:text-white hover:bg-[#1f242d]'
    }`}
  >
    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' }) : icon}
  </button>
);

const MetadataGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-3">
    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</p>
    <div className="space-y-2">{children}</div>
  </div>
);

const MetadataItem: React.FC<{ tag: string; label: string; value: string }> = ({ tag, label, value }) => (
  <div className="p-3 bg-[#161a21] rounded-lg border border-[#1f242d] group">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[9px] font-mono text-blue-500/70">{tag}</span>
      <span className="text-[9px] text-gray-600 uppercase font-bold">{label}</span>
    </div>
    <p className="text-xs text-gray-300 font-medium break-all">{value}</p>
  </div>
);

