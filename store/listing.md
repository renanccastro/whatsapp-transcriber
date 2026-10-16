# Chrome Web Store — ficha da extensão

Pacote: `npm run zip` → `zap-transcreve.zip` (com a chave do PostHog).
Imagens: `POSTHOG_KEY= node scripts/build.mjs && node store/shots.mjs` → `store/out/`.

## Ficha da loja

- **Categoria:** Produtividade → Comunicação (ou "Ferramentas", se não houver)
- **Idioma:** Português (Brasil)
- **Ícone:** `public/icons/128.png`
- **Capturas de tela (1280×800):** `store/out/screenshot-1.png`, `store/out/screenshot-2.png`
- **Bloco promocional pequeno (440×280):** `store/out/promo-440x280.png`
- **Site:** https://github.com/renanccastro/whatsapp-transcriber
- **Suporte:** https://github.com/renanccastro/whatsapp-transcriber/issues

**Resumo** (vem do `description` do manifest, máx. 132 caracteres):
Transcreve os áudios do WhatsApp Web direto na conversa. Roda no seu computador, sem enviar o áudio para ninguém.

**Descrição:**

```
Cansou de ouvir áudio de 3 minutos? O Zap Transcreve transforma os áudios do WhatsApp Web em texto, dentro do próprio balão da mensagem.

• Automático: o áudio vira texto assim que aparece na tela. Também dá para transcrever só quando clicar.
• Privado: a transcrição roda no seu computador (Whisper, da OpenAI). O áudio não sai do seu navegador.
• Rápido: usa a placa de vídeo quando o computador tem uma. Um áudio de 20 segundos sai em 1 a 2 segundos.
• Português, inglês e espanhol, ou detecção automática.
• Botão para copiar o texto.
• As transcrições ficam guardadas: abriu a conversa de novo, o texto já está lá.

Na primeira vez, a extensão baixa o modelo de voz (cerca de 250 a 400 MB). Depois disso funciona sem baixar mais nada.

Em breve: transcrição na nuvem, mais precisa e com resumo dos áudios longos.

O Zap Transcreve não é afiliado ao WhatsApp nem à Meta.
```

## Privacidade (aba "Práticas de privacidade")

**Finalidade única:**
Transcrever em texto os áudios das conversas do WhatsApp Web e mostrar o texto dentro da mensagem.

**Justificativas das permissões:**
- `storage`: guardar as preferências (automático, qualidade, idioma) e as transcrições já feitas, para não transcrever o mesmo áudio de novo.
- `unlimitedStorage`: o modelo de voz Whisper tem de 80 MB a 1,5 GB e fica no cache da extensão para funcionar sem baixar de novo.
- Permissão de host `huggingface.co` / `*.hf.co`: baixar os arquivos do modelo de voz Whisper, só na primeira vez.
- Content script em `web.whatsapp.com`: achar as mensagens de voz da conversa aberta, ler o áudio e mostrar a transcrição dentro do balão.

**Código remoto:** Não. Todo o JavaScript e o WebAssembly estão no pacote. Do Hugging Face vêm só os pesos do modelo (dados, não código).

**Dados coletados:** marcar só **"Atividade do usuário"** (os cliques em "nuvem em breve" e a contagem de transcrições, anônimos). Não marcar "Conteúdo do site": o áudio e o texto ficam no computador.
Marcar as três certificações (não vende dados, não usa para outra finalidade, não usa para crédito).

**Política de privacidade:**
https://github.com/renanccastro/whatsapp-transcriber/blob/main/PRIVACY.md

## Distribuição

- Visibilidade: **Pública** (ou "Não listada" para um primeiro teste só com link).
- Regiões: todas.
