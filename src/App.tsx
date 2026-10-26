/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DicomUploader } from './components/DicomUploader';

export default function App() {
  return (
    <main className="min-h-screen bg-[#060b19] text-gray-200 p-6 flex flex-col">
      <header className="mb-6 flex flex-wrap items-center justify-between border-b border-gray-800 pb-4 gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <div className="w-3.5 h-3.5 border-2 border-white rounded-sm"></div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">
              Visor Médico DICOM & NNT Viewer <span className="text-xs font-normal text-purple-400 bg-purple-950/70 border border-purple-800 px-2 py-0.5 rounded ml-2">CBCT 3D</span>
            </h1>
            <p className="text-xs text-gray-400">Lectura y análisis de archivos radiológicos DICOM (.dcm, .dicom) y NNT Viewer (.nnt, .nntx, .ima)</p>
          </div>
        </div>
      </header>
      <DicomUploader />
    </main>
  );
}

