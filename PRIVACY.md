# Política de privacidade — Zap Transcreve

Atualizada em 16/10/2026.

O Zap Transcreve transcreve os áudios do WhatsApp Web dentro do seu navegador.

## O que fica só no seu computador

- **Áudios.** A extensão lê os áudios da conversa aberta no WhatsApp Web e os
  transcreve no próprio navegador. O áudio não é enviado para nenhum servidor.
- **Transcrições.** O texto fica guardado no armazenamento local da extensão
  (`chrome.storage.local`), para não transcrever o mesmo áudio duas vezes.
  Ele some quando você remove a extensão.
- **Preferências.** Transcrição automática, qualidade e idioma ficam em
  `chrome.storage.sync`, que o Chrome sincroniza entre os seus computadores.

## O que é baixado

Na primeira transcrição, a extensão baixa o modelo de voz Whisper do Hugging
Face (huggingface.co). Esse download não envia nenhum dado seu.

## O que enviamos

Para saber se a extensão é útil e se vale lançar a transcrição na nuvem,
enviamos eventos de uso anônimos ao PostHog (us.i.posthog.com):

- `installed`: a extensão foi instalada.
- `transcription_done`: um áudio foi transcrito, com a duração em segundos, o
  tempo gasto, o modelo e se usou a placa de vídeo ou o processador.
- `cloud_interest`: você clicou em "Mais preciso na nuvem" ou em "Quero usar
  quando lançar".

Cada evento leva um identificador aleatório criado na instalação e a versão da
extensão. Nunca enviamos o áudio, o texto transcrito, nomes, números de
telefone, mensagens ou qualquer conteúdo das suas conversas. Não vendemos nem
compartilhamos esses dados.

## Contato

Dúvidas: abra uma issue em
https://github.com/renanccastro/whatsapp-transcriber/issues.

O Zap Transcreve não é afiliado ao WhatsApp nem à Meta.
