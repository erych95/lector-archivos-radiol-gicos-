import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X, FileCode, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DicomViewer Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Ocurrió un error inesperado al procesar la imagen médica.';

      return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-red-500/30 rounded-xl max-w-lg w-full p-6 shadow-2xl text-gray-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-gray-800 pb-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {this.props.title || 'Error al visualizar estudio DICOM / NNT'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    Se detectó un problema de decodificación o renderizado
                  </p>
                </div>
              </div>
              <button
                onClick={this.handleReset}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3 text-sm text-red-200 mb-4 font-mono text-xs break-words">
              {errorMessage}
            </div>

            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              El archivo podría estar corrupto, utilizar una compresión no soportada por la cabecera del visor o haberse desincronizado con Cornerstone. Puede intentar recargar el visor o cerrar este estudio para seleccionar otro.
            </p>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={this.handleReset}
                  className="flex-1 min-w-[140px] px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm rounded-lg flex items-center justify-center space-x-2 shadow-lg transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Cerrar Visor y Volver</span>
                </button>
              </div>

              <button
                onClick={this.toggleDetails}
                className="w-full text-xs text-gray-400 hover:text-gray-200 flex items-center justify-between px-3 py-2 bg-gray-900/50 hover:bg-gray-900 rounded-lg border border-gray-800 transition-colors"
              >
                <span className="flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>Detalles técnicos del error</span>
                </span>
                {this.state.showDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {this.state.showDetails && (
                <div className="p-3 bg-black/60 rounded-lg border border-gray-800 text-[11px] font-mono text-gray-400 max-h-40 overflow-y-auto space-y-2">
                  <p className="text-red-400 font-semibold">{this.state.error?.toString()}</p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="whitespace-pre-wrap text-[10px] text-gray-500 leading-tight">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
