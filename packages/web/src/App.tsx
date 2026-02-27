import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ExportView from './pages/ExportView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/export/:id" element={<ExportView />} />
      </Routes>
    </BrowserRouter>
  )
}
