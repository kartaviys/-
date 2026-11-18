package com.technews.pulse.filter

import com.technews.pulse.data.AppSettings
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TechFilterTest {
    private val s = AppSettings()

    private fun verdict(title: String, summary: String = "", url: String = "https://example.com/a", trust: Int = 0) =
        TechFilter.evaluate(title, summary, url, trust, s)

    private fun technical(title: String, summary: String = "", url: String = "https://example.com/a", trust: Int = 0) {
        val v = verdict(title, summary, url, trust)
        assertTrue("Должно пройти (score=${v.score}): $title\n${v.signals}", v.passed)
    }

    private fun hype(title: String, summary: String = "", url: String = "https://example.com/a", trust: Int = 0) {
        val v = verdict(title, summary, url, trust)
        assertFalse("Должно отсеяться (score=${v.score}): $title\n${v.signals}", v.passed)
    }

    @Test fun technicalEnglish() {
        technical("Speculative decoding for faster LLM inference with vLLM")
        technical("Fine-tuning Llama 3 with QLoRA on a single GPU")
        technical("Mixture-of-Experts explained: routing, load balancing and training stability")
        technical("Scaling laws for sparse autoencoders in mechanistic interpretability")
        technical("Writing a FlashAttention kernel in Triton from scratch")
        technical("Qwen3-Coder: open-weights 480B MoE model tops SWE-bench")
        technical("Show HN: I built a tiny transformer in 300 lines of C", url = "https://github.com/x/y")
        technical("Attention Sinks in Long-Context Language Models", url = "https://arxiv.org/abs/2501.00001")
    }

    @Test fun technicalRussian() {
        technical("Квантизация LLM: разбираем GPTQ, AWQ и GGUF на практике")
        technical("Как мы дообучили модель на 7B параметров для поиска по коду")
        technical("Архитектура трансформера с нуля на PyTorch")
        technical("Бенчмарк открытых моделей для RAG: эмбеддинги и реранкеры")
    }

    @Test fun hypeEnglish() {
        hype("OpenAI CEO Sam Altman warns AI could be dangerous for humanity")
        hype("Elon Musk says AI will take over the world within five years")
        hype("Nvidia shares surge as investors bet on AI boom")
        hype("AI startup raises \$2 billion at \$20 billion valuation")
        hype("Godfather of AI warns of existential risk")
        hype("AI will replace programmers, says tech billionaire")
        hype("Senators push new AI regulation bill after lawsuit")
        hype("Sam Altman says GPT-6 will be much better at reasoning")
    }

    @Test fun hypeRussian() {
        hype("ИИ захватит мир, заявил глава OpenAI")
        hype("Глава OpenAI предупредил об опасности искусственного интеллекта")
        hype("Илон Маск считает, что ИИ уничтожит человечество")
        hype("Нейросети заменят программистов уже через два года")
        hype("Акции Nvidia выросли на фоне инвестиций в ИИ")
    }

    @Test fun cyrillicWordBoundaries() {
        // «безопасность» не должна ловиться как «опасн~», «искусственный» — как «иск»
        val v = verdict("Безопасность искусственного интеллекта: red teaming и jailbreak-атаки на LLM")
        assertTrue(v.signals.toString(), v.signals.none { it.label.startsWith("«опасный ИИ»") || it.label.startsWith("политика") })
    }

    @Test fun customWords() {
        val custom = s.copy(blockWords = listOf("crypto"), allowWords = listOf("Rust"))
        assertFalse(TechFilter.evaluate("Crypto LLM benchmark", "", "https://x.com", 0, custom).passed)
        assertTrue(TechFilter.evaluate("Rust release notes", "", "https://x.com", 0, custom).passed)
    }
}
