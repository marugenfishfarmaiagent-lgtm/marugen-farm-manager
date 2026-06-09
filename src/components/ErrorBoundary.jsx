import { Component } from 'react'
import { captureException } from '../lib/monitoring'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
    captureException(error, { componentStack: info?.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] bg-slate-900 text-white p-8 rounded-xl border border-slate-700">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-slate-400 mb-4 text-sm">{this.state.error?.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
