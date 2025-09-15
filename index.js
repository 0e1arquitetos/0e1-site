// index.js

// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

const express = require('express');
const { Client } = require('@notionhq/client');

// Inicializa o cliente da API do Notion
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const app = express();
// O Render usará a porta que o sistema definir. Se estiver rodando localmente, usará 3000.
const port = process.env.PORT || 3000;

// Função para buscar e processar o conteúdo da página do Notion
async function getNotionPageContent() {
    try {
        const pageId = process.env.NOTION_PAGE_ID;
        const response = await notion.blocks.children.list({
            block_id: pageId,
            page_size: 50,
        });
        return response.results;
    } catch (error) {
        console.error('Erro ao buscar o conteúdo da página:', error.body || error);
        return null;
    }
}

// Função para converter os blocos do Notion em HTML
function renderBlocksToHtml(blocks) {
    if (!blocks) return '';

    let htmlContent = '';
    blocks.forEach(block => {
        const blockType = block.type;
        const blockContent = block[blockType];

        switch (blockType) {
            case 'paragraph':
                const paragraphText = blockContent.rich_text.map(rt => rt.plain_text).join('');
                htmlContent += `<p>${paragraphText}</p>`;
                break;
            case 'heading_1':
                const heading1Text = blockContent.rich_text.map(rt => rt.plain_text).join('');
                htmlContent += `<h1>${heading1Text}</h1>`;
                break;
            case 'heading_2':
                const heading2Text = blockContent.rich_text.map(rt => rt.plain_text).join('');
                htmlContent += `<h2>${heading2Text}</h2>`;
                break;
            case 'image':
                const imageUrl = blockContent.file ? blockContent.file.url : blockContent.external.url;
                htmlContent += `<img src="${imageUrl}" alt="Imagem do Notion" style="max-width: 100%; height: auto;">`;
                break;
            // Você pode adicionar mais tipos de blocos aqui, como 'bulleted_list_item', 'numbered_list_item', etc.
            default:
                // Se o tipo do bloco não for reconhecido, pule ou adicione uma mensagem de aviso
                console.log(`Tipo de bloco não suportado: ${blockType}`);
                break;
        }
    });
    return htmlContent;
}

// Rota principal que serve a página HTML
app.get('/', async (req, res) => {
    const blocks = await getNotionPageContent();
    const renderedHtml = renderBlocksToHtml(blocks);

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Meu Site Gerado pelo Notion</title>
            <style>
                body { font-family: sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 800px; margin: 0 auto; padding: 20px; }
                img { max-width: 100%; height: auto; display: block; margin: 20px 0; }
                h1, h2, h3 { color: #222; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="container">
                ${renderedHtml}
            </div>
        </body>
        </html>
    `);
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});