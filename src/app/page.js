'use client'
import React, { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Upload, FileType, X, ArrowRight, Download, RefreshCw, CheckCircle, AlertCircle, Image as ImageIcon, FileText } from 'lucide-react'

// เราจะโหลด library สำหรับจัดการ PDF และ รูปภาพผ่าน CDN เพื่อให้ทำงานได้ในไฟล์เดียว
// ในโปรเจกต์ Next.js จริง คุณควรใช้: npm install jspdf pdfjs-dist

const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"

export default function FileConverterApp() {
  const [files, setFiles] = useState([])
  const [targetFormat, setTargetFormat] = useState('pdf')
  const [isConverting, setIsConverting] = useState(false)
  const [convertedFiles, setConvertedFiles] = useState([])
  const [libsLoaded, setLibsLoaded] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  // Load Libraries
  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve()
          return
        }
        const script = document.createElement('script')
        script.src = src
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
      })
    }

    Promise.all([loadScript(PDF_JS_URL), loadScript(JSPDF_URL)])
      .then(() => {
        // Setup PDF.js worker
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL
        }
        setLibsLoaded(true)
        console.log("Libraries loaded")
      })
      .catch((err) => console.error("Failed to load libraries", err))
  }, [])

  // Handle Drag & Drop
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleChange = (e) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files)
    }
  }

  const handleFiles = (fileList) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    const newFiles = Array.from(fileList)
      .filter(file => validTypes.includes(file.type))
      .map(file => ({
        id: Math.random().toString(36).substring(7),
        file: file,
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        type: file.type,
        status: 'pending' // pending, converting, done, error
      }))
    
    setFiles(prev => [...prev, ...newFiles])
  }

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  // Core Conversion Logic
  const convertFiles = async () => {
    if (!libsLoaded) {
      alert("กรุณารอสักครู่ กำลังโหลด Library...")
      return
    }

    setIsConverting(true)
    setConvertedFiles([])

    const results = []

    for (const item of files) {
      try {
        let resultBlob = null
        let resultExt = targetFormat
        
        // Logic for conversion
        if (item.type.startsWith('image/')) {
          if (targetFormat === 'pdf') {
            resultBlob = await convertImageToPDF(item.file)
          } else if (targetFormat === 'jpg') {
            resultBlob = await convertImageToJPG(item.file)
          }
        } else if (item.type === 'application/pdf') {
          if (targetFormat === 'jpg') {
            resultBlob = await convertPDFToJPG(item.file)
          } else if (targetFormat === 'pdf') {
            // PDF to PDF (Just copy)
            resultBlob = item.file 
          }
        }

        if (resultBlob) {
          const url = URL.createObjectURL(resultBlob)
          results.push({
            originalName: item.name,
            newName: item.name.replace(/\.[^/.]+$/, "") + `_converted.${resultExt}`,
            url: url,
            status: 'success'
          })
        }
      } catch (error) {
        console.error("Conversion error:", error)
        results.push({
          originalName: item.name,
          status: 'error',
          error: error.message
        })
      }
    }

    setConvertedFiles(results)
    setIsConverting(false)
  }

  // Helper: Image -> JPG
  const convertImageToJPG = (file) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        // Fill white background for transparent images
        ctx.fillStyle = '#FFFFFF' 
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  // Helper: Image -> PDF
  const convertImageToPDF = (file) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const { jsPDF } = window.jspdf
        // Calculate dimensions to fit A4
        const doc = new jsPDF()
        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        
        const widthRatio = pageWidth / img.width
        const heightRatio = pageHeight / img.height
        const ratio = widthRatio < heightRatio ? widthRatio : heightRatio
        
        const canvasWidth = img.width * ratio
        const canvasHeight = img.height * ratio
        
        const marginX = (pageWidth - canvasWidth) / 2
        const marginY = (pageHeight - canvasHeight) / 2

        doc.addImage(img, 'JPEG', marginX, marginY, canvasWidth, canvasHeight)
        resolve(doc.output('blob'))
      }
      img.src = URL.createObjectURL(file)
    })
  }

  // Helper: PDF -> JPG (First Page Only for Demo)
  const convertPDFToJPG = async (file) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise
    const page = await pdf.getPage(1) // Get first page
    
    const viewport = page.getViewport({ scale: 1.5 }) // High quality scale
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.height = viewport.height
    canvas.width = viewport.width

    await page.render({ canvasContext: context, viewport: viewport }).promise
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
    })
  }

  const resetAll = () => {
    setFiles([])
    setConvertedFiles([])
    setIsConverting(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans selection:bg-indigo-100">
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-15 h-15 bg-white rounded-lg flex items-center justify-center text-white font-bold">
              {/* <RefreshCw size={18} /> */}
              <Image src="/images/logo.png" alt="Dream&Yellee Convert Logo" width={100} height={24} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
              Dream&Yellee Convert
            </h1>
          </div>
          <div className="text-sm text-gray-500 hidden sm:block">
            แปลงไฟล์ JPG, PDF, WEBP ฟรีและปลอดภัย
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        
        {/* Intro */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl mb-4">
            แปลงไฟล์ของคุณได้ง่ายๆ
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            รองรับการแปลงระหว่าง JPG, PDF และ WEBP ประมวลผลบนเบราว์เซอร์ของคุณ 100% ไม่มีการอัปโหลดไฟล์ขึ้น Server
          </p>
        </div>

        {/* Converter Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          
          {/* 1. Upload Section */}
          <div className={`p-8 border-b border-gray-100 transition-colors ${dragActive ? 'bg-indigo-50' : 'bg-white'}`}
               onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
          >
            {files.length === 0 ? (
              <div 
                className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/50 transition-all group"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
                  <Upload size={28} />
                </div>
                <p className="text-lg font-medium text-gray-700">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก</p>
                <p className="text-sm text-gray-400 mt-2">รองรับ JPG, WEBP, PDF</p>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".jpg,.jpeg,.webp,.pdf" 
                  multiple 
                  onChange={handleChange}
                />
              </div>
            ) : (
              <div>
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-700">ไฟล์ที่เลือก ({files.length})</h3>
                    <button onClick={resetAll} className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                       <X size={14} /> ล้างทั้งหมด
                    </button>
                 </div>
                 <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                   {files.map((file) => (
                     <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                       <div className="flex items-center gap-3 overflow-hidden">
                         <div className="w-10 h-10 bg-white rounded-lg border flex items-center justify-center text-gray-500 shrink-0">
                            {file.type.includes('pdf') ? <FileText size={20} /> : <ImageIcon size={20} />}
                         </div>
                         <div className="min-w-0">
                           <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                           <p className="text-xs text-gray-500">{file.size}</p>
                         </div>
                       </div>
                       <button 
                         onClick={() => removeFile(file.id)}
                         className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                       >
                         <X size={16} />
                       </button>
                     </div>
                   ))}
                 </div>
                 
                 {/* Add more button */}
                 <div className="mt-4 text-center">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm text-indigo-600 font-medium hover:underline"
                    >
                      + เพิ่มไฟล์อีก
                    </button>
                 </div>
              </div>
            )}
          </div>

          {/* 2. Controls Section */}
          {files.length > 0 && convertedFiles.length === 0 && (
            <div className="p-6 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="text-sm font-medium text-gray-600 whitespace-nowrap">แปลงเป็น:</span>
                <div className="relative w-full sm:w-48">
                  <select 
                    value={targetFormat}
                    onChange={(e) => setTargetFormat(e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-300 text-gray-700 py-2.5 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-indigo-500 shadow-sm"
                  >
                    <option value="pdf">PDF Document (.pdf)</option>
                    <option value="jpg">JPG Image (.jpg)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>

              <button
                onClick={convertFiles}
                disabled={isConverting || !libsLoaded}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-white font-medium shadow-lg transition-all
                  ${isConverting 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-0.5'
                  }`}
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="animate-spin" size={18} /> กำลังแปลง...
                  </>
                ) : (
                  <>
                    แปลงไฟล์ <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* 3. Results Section */}
          {convertedFiles.length > 0 && (
             <div className="p-8 bg-green-50/50">
               <div className="flex items-center gap-2 mb-6 text-green-700">
                 <CheckCircle size={24} />
                 <h3 className="text-lg font-bold">แปลงไฟล์เสร็จสิ้น!</h3>
               </div>
               
               <div className="space-y-3">
                 {convertedFiles.map((item, idx) => (
                   <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-green-100">
                     <div className="min-w-0 pr-4">
                       <p className="text-sm text-gray-500 truncate mb-1">จาก: {item.originalName}</p>
                       <p className="font-medium text-gray-800 truncate text-lg flex items-center gap-2">
                         {item.status === 'success' ? (
                            <span className="text-green-600 flex items-center gap-1"><FileType size={16}/> {item.newName}</span>
                         ) : (
                            <span className="text-red-500 flex items-center gap-1"><AlertCircle size={16}/> เกิดข้อผิดพลาด</span>
                         )}
                       </p>
                     </div>

                     {item.status === 'success' && (
                       <a 
                         href={item.url} 
                         download={item.newName}
                         className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm font-medium whitespace-nowrap"
                       >
                         <Download size={16} /> ดาวน์โหลด
                       </a>
                     )}
                   </div>
                 ))}
               </div>

               <div className="mt-8 text-center">
                 <button 
                    onClick={resetAll}
                    className="text-gray-500 hover:text-gray-700 font-medium underline"
                 >
                   แปลงไฟล์อื่นเพิ่มเติม
                 </button>
               </div>
             </div>
          )}

        </div>

        {/* Footer info */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="p-4 rounded-xl bg-white shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <FileType size={20} />
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">คุณภาพสูง</h3>
                <p className="text-sm text-gray-500">คงคุณภาพของรูปภาพและเอกสารไว้อย่างดีที่สุด</p>
            </div>
            <div className="p-4 rounded-xl bg-white shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <RefreshCw size={20} />
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">รวดเร็ว</h3>
                <p className="text-sm text-gray-500">ประมวลผลทันทีในเครื่องของคุณ ไม่ต้องรอคิว</p>
            </div>
            <div className="p-4 rounded-xl bg-white shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle size={20} />
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">ฟรีตลอดไป</h3>
                <p className="text-sm text-gray-500">ไม่มีค่าใช้จ่ายแอบแฝง และไม่ต้องลงทะเบียน</p>
            </div>
        </div>

      </main>
    </div>
  )
}