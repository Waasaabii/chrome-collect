import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ExportView from './pages/ExportView'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/export/:id" element={<ExportView />} />
      </Routes>
    </HashRouter>
  )
}
