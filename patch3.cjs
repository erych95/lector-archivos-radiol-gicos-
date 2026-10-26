const fs = require('fs');
let code = fs.readFileSync('src/components/DicomViewer.tsx', 'utf8');

const targetStr = `    tools.forEach(tool => cornerstoneTools.addTool(tool));
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
    };`;

const replacement = `    tools.forEach(tool => cornerstoneTools.addTool(tool));
    cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);
    cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);
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
    };`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacement);
  fs.writeFileSync('src/components/DicomViewer.tsx', code);
  console.log("Patched successfully");
} else {
  console.log("Could not find target string");
}
