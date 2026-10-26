const fs = require('fs');
let code = fs.readFileSync('src/components/DicomViewer.tsx', 'utf8');

const targetStr = `  const loadImage = useCallback((file: File) => {
    const element = viewerRef.current;
    if (!element) return;

    const imageIndex = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
    const imageId = \`dicomfile:\${imageIndex}\`;

    cornerstone.loadImage(imageId).then(image => {
      cornerstone.displayImage(element, image);
      
      // Initialize viewport info
      const viewport = cornerstone.getViewport(element);
      setViewportData(viewport);
    });
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
    cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });

    loadImage(activeFile.file);

    const onImageRendered = () => {
      const viewport = cornerstone.getViewport(element);
      setViewportData(viewport);
    };

    element.addEventListener('cornerstoneimagerendered', onImageRendered);

    return () => {
      element.removeEventListener('cornerstoneimagerendered', onImageRendered);
      cornerstone.disable(element);
    };
  }, []);

  useEffect(() => {
    loadImage(activeFile.file);
  }, [activeFileId, loadImage]);`;

const replacement = `  useEffect(() => {
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
      cornerstoneTools.StackScrollMouseWheelTool,
      cornerstoneTools.StackScrollTool,
    ];

    tools.forEach(tool => cornerstoneTools.addTool(tool));
    cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });
    cornerstoneTools.setToolActive('StackScrollMouseWheel', { });

    const ids = files.map(f => {
      const index = cornerstoneWADOImageLoader.wadouri.fileManager.add(f.file);
      return \`dicomfile:\${index}\`;
    });

    const stack = {
      currentImageIdIndex: Math.max(0, files.findIndex(f => f.id === activeFileId)),
      imageIds: ids
    };

    cornerstoneTools.addStackStateManager(element, ['stack']);
    cornerstoneTools.addToolState(element, 'stack', stack);

    cornerstone.loadImage(ids[stack.currentImageIdIndex]).then(image => {
      cornerstone.displayImage(element, image);
      const viewport = cornerstone.getViewport(element);
      setViewportData(viewport);
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
  }, [activeFileId, files]);`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacement);
  fs.writeFileSync('src/components/DicomViewer.tsx', code);
  console.log("Patched successfully");
} else {
  console.log("Could not find target string");
}
