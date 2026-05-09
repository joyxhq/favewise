import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { EmptyState } from './patterns/EmptyState'

interface Props {
  children: ReactNode
  fallbackLabel?: string
  className?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Favewise] Unhandled render error:', error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <EmptyState
          Icon={AlertTriangle}
          tone="danger"
          title={this.props.fallbackLabel ?? 'Something went wrong'}
          description={this.state.error?.message ?? 'An unexpected error occurred'}
          action={
            <Button size="sm" variant="outline" onClick={this.handleRetry}>
              <RefreshCw className="h-3 w-3" />
              Try again
            </Button>
          }
        />
      )
    }
    if (this.props.className) {
      return <div className={this.props.className}>{this.props.children}</div>
    }
    return this.props.children
  }
}
