import '~/shared/lib/webext'
import React from 'react'
import ReactDOM from 'react-dom/client'
import PopupApp from './App'
import '../sidepanel/style.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
)
