import { EngineRunner, PdfEngine, PdfiumNative } from '@embedpdf/engines'
import { PdfErrorCode } from '@embedpdf/models'
import { init } from '@embedpdf/pdfium'
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url'

function rgbaToBmpBlob(rgba, width, height) {
  const pixels = width * height * 4
  const headerLength = 66
  const le32 = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]
  const header = new Uint8Array([
    66, 77,
    ...le32(headerLength + pixels),
    0, 0, 0, 0,
    headerLength, 0, 0, 0,
    40, 0, 0, 0,
    ...le32(width),
    ...le32(-height),
    1, 0,
    32, 0,
    3, 0, 0, 0,
    ...le32(pixels),
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    255, 0, 0, 0,
    0, 255, 0, 0,
    0, 0, 255, 0,
  ])
  return new Blob(
    [header, new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)],
    { type: 'image/bmp' },
  )
}

async function workerImageDataToBlobConverter(getImageData, imageType = 'image/png', quality) {
  const pdfImage = getImageData()
  if (imageType === 'image/bmp') {
    return rgbaToBmpBlob(pdfImage.data, pdfImage.width, pdfImage.height)
  }

  if (typeof OffscreenCanvas === 'function' && typeof ImageData === 'function') {
    const canvas = new OffscreenCanvas(pdfImage.width, pdfImage.height)
    const context = canvas.getContext('2d')
    if (context && typeof canvas.convertToBlob === 'function') {
      context.putImageData(new ImageData(pdfImage.data, pdfImage.width, pdfImage.height), 0, 0)
      return canvas.convertToBlob({ type: imageType, quality })
    }
  }

  return rgbaToBmpBlob(pdfImage.data, pdfImage.width, pdfImage.height)
}

const runner = new EngineRunner()

async function bootPdfWorker() {
  try {
    const response = await fetch(pdfiumWasmUrl)
    const wasmBinary = await response.arrayBuffer()
    const wasmModule = await init({ wasmBinary })
    const native = new PdfiumNative(wasmModule)
    runner.engine = new PdfEngine(native, {
      imageConverter: workerImageDataToBlobConverter,
    })
    runner.ready()
  } catch (error) {
    self.postMessage({
      id: '0',
      type: 'ExecuteResponse',
      data: {
        type: 'error',
        value: {
          type: 'reject',
          reason: {
            code: PdfErrorCode.Initialization,
            message: error instanceof Error ? error.message : String(error || 'Failed to initialize PDF worker engine'),
          },
        },
      },
    })
  }
}

void bootPdfWorker()
