
const OLLAMA_URL =
  process.env.OLLAMA_URL ||
  'http://127.0.0.1:11434';

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ||
  'qwen2.5-coder:1.5b';

async function perguntarOllama(mensagens) {
  const resposta = await fetch(
    `${OLLAMA_URL}/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: mensagens,
        stream: false
      }),
      signal: AbortSignal.timeout(120000)
    }
  );

  if (!resposta.ok) {
    throw new Error(
      `Ollama retornou HTTP ${resposta.status}`
    );
  }

  const dados = await resposta.json();
  const conteudo = dados.message?.content;

  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    throw new Error('O Ollama retornou uma resposta vazia.');
  }

  return conteudo.trim();
}

module.exports = {
  perguntarOllama
};
