package expo.modules.mlkittextrecognition

import android.graphics.Rect
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Módulo local de OCR on-device (ML Kit Text Recognition v2, variante bundled).
 * Processa uma foto já salva em disco (file URI) e devolve blocos → linhas com
 * caixa em PIXELS e confiança por linha. O adaptador JS (src/ocr/engines/mlkit.ts)
 * normaliza para o contrato OcrEngine — nada fora dele consome este módulo.
 */
class MlkitTextRecognitionModule : Module() {
  private var recognizer: TextRecognizer? = null

  // Singleton preguiçoso: criar o recognizer a cada chamada custa caro.
  private fun obtainRecognizer(): TextRecognizer =
    recognizer
      ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }

  override fun definition() = ModuleDefinition {
    Name("MlkitTextRecognition")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_NO_CONTEXT", "Contexto Android indisponível", null))
        return@AsyncFunction
      }
      val image: InputImage
      try {
        // fromFilePath aplica a rotação EXIF — as caixas saem na imagem "em pé".
        image = InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_IMAGE_LOAD", "Falha ao carregar imagem: $uri", e))
        return@AsyncFunction
      }
      obtainRecognizer()
        .process(image)
        .addOnSuccessListener { text ->
          promise.resolve(textToMap(text, image.width, image.height))
        }
        .addOnFailureListener { e ->
          promise.reject(CodedException("ERR_RECOGNIZE", e.message ?: "Falha no reconhecimento", e))
        }
    }

    OnDestroy {
      recognizer?.close()
      recognizer = null
    }
  }

  private fun rectToMap(rect: Rect?): Map<String, Int>? =
    rect?.let { mapOf("x" to it.left, "y" to it.top, "w" to it.width(), "h" to it.height()) }

  private fun textToMap(text: Text, width: Int, height: Int): Map<String, Any?> =
    mapOf(
      "width" to width,
      "height" to height,
      "blocks" to
        text.textBlocks.map { block ->
          mapOf(
            "text" to block.text,
            "frame" to rectToMap(block.boundingBox),
            "lines" to
              block.lines.map { line ->
                mapOf(
                  "text" to line.text,
                  "frame" to rectToMap(line.boundingBox),
                  "confidence" to line.confidence,
                  "angle" to line.angle,
                )
              },
          )
        },
    )
}
