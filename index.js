// index.js

require('dotenv').config();

const express = require('express');
const { Client } = require('@notionhq/client');

// Inicializa o cliente da API do Notion
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const app = express();
const port = process.env.PORT || 3000;

// Função para buscar os blocos de uma página e convertê-los em HTML
async function renderPageById(pageId) {
    try {
        const blocks = await notion.blocks.children.list({ block_id: pageId });
        return renderBlocksToHtml(blocks.results);
    } catch (error) {
        console.error('Erro ao buscar a página:', error.body || error);
        return '<h1>Erro ao carregar o conteúdo.</h1>';
    }
}

// Função para converter os blocos do Notion em HTML
function renderBlocksToHtml(blocks) {
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
                const h1Text = blockContent.rich_text.map(rt => rt.plain_text).join('');
                htmlContent += `<h1>${h1Text}</h1>`;
                break;
            case 'heading_2':
                const h2Text = blockContent.rich_text.map(rt => rt.plain_text).join('');
                htmlContent += `<h2>${h2Text}</h2>`;
                break;
            case 'image':
                const imageUrl = blockContent.file?.url || blockContent.external?.url;
                htmlContent += `<img src="${imageUrl}" alt="Imagem do Notion" style="max-width: 100%; height: auto;">`;
                break;
            case 'toggle':
                const toggleTitle = blockContent.rich_text.map(rt => rt.plain_text).join('');
                // Note: Esta é uma solução simplificada para o toggle.
                // Para renderizar o conteúdo interno, seria necessária uma nova requisição
                // ou uma lógica mais complexa de recursão.
                htmlContent += `<details><summary><h3>${toggleTitle}</h3></summary></details>`;
                break;
            case 'child_database':
                htmlContent += `<p>[Conteúdo de base de dados embutida. Requer uma requisição separada para ser exibido.]</p>`;
                break;
            case 'child_page':
                // A navegação entre páginas já é feita nas rotas do Express.
                // Este bloco seria usado para links internos.
                htmlContent += `<h4><a href="/${blockContent.title.toLowerCase().replace(/\s/g, '-')}" >${blockContent.title}</a></h4>`;
                break;
            default:
                console.log(`Tipo de bloco não suportado: ${blockType}`);
                break;
        }
    });
    return htmlContent;
}

// Rota para a página Home
app.get('/', async (req, res) => {
    const renderedStaticHtml = await renderPageById(process.env.NOTION_HOME_PAGE_ID);
    
    // Busca os cards do banco de dados para o slideshow
    const databaseId = process.env.NOTION_DATABASE_ID;
    const response = await notion.databases.query({ database_id: databaseId });

    let htmlCards = '';
    response.results.forEach(page => {
        const title = page.properties.Nome?.title[0]?.plain_text || 'Sem Título';
        const imageUrl = page.properties.Capa?.files[0]?.file?.url || 'https://via.placeholder.com/400';
        const slug = page.properties.URL?.rich_text[0]?.plain_text || page.id;

        htmlCards += `
            <a href="/projetos/${slug}" style="text-decoration: none; color: inherit;">
                <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <img src="${imageUrl}" alt="${title}" style="width: 100%; height: 200px; object-fit: cover;">
                    <div style="padding: 16px;">
                        <h3>${title}</h3>
                    </div>
                </div>
            </a>
        `;
    });
    
    // Renderiza a página Home com o conteúdo estático + os cards
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Home - Meu Site</title>
            <style>body { font-family: sans-serif; } .container { max-width: 800px; margin: 0 auto; padding: 20px; } .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }</style>
        </head>
        <body>
            <div class="container">
                ${renderedStaticHtml}
                <div class="card-grid">
                    ${htmlCards}
                </div>
            </div>
        </body>
        </html>
    `);
});

// Rota para a página de Projetos
app.get('/projetos', async (req, res) => {
    // 1. Busca o conteúdo estático da página "Projetos" (incluindo o menu)
    const renderedStaticHtml = await renderPageById(process.env.NOTION_PROJETOS_PAGE_ID);

    // 2. Busca os dados dos projetos na base de dados
    const databaseId = process.env.NOTION_DATABASE_ID;
    const response = await notion.databases.query({ database_id: databaseId });

    let htmlCards = '';
    response.results.forEach(page => {
        const title = page.properties.Nome?.title[0]?.plain_text || 'Sem Título';
        const imageUrl = page.properties.Capa?.files[0]?.file?.url || 'https://via.placeholder.com/400';
        const slug = page.properties.URL?.rich_text[0]?.plain_text || page.id;
        const type = page.properties.Tipo?.select?.name || 'Sem Tipo';

        htmlCards += `
            <a href="/projetos/${slug}" style="text-decoration: none; color: inherit;">
                <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <img src="${imageUrl}" alt="${title}" style="width: 100%; height: 200px; object-fit: cover;">
                    <div style="padding: 16px;">
                        <h3>${title}</h3>
                        <p>${type}</p>
                    </div>
                </div>
            </a>
        `;
    });
    
    // 3. Combina o conteúdo estático e dinâmico
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Projetos - Meu Site</title>
            <style>body { font-family: sans-serif; } .container { max-width: 800px; margin: 0 auto; padding: 20px; } .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }</style>
        </head>
        <body>
            <div class="container">
                ${renderedStaticHtml}
                <div class="card-grid">
                    ${htmlCards}
                </div>
            </div>
        </body>
        </html>
    `);
});

// Rota para páginas de projeto individuais
app.get('/projetos/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const response = await notion.databases.query({
            database_id: process.env.NOTION_DATABASE_ID,
            filter: { property: 'URL', rich_text: { equals: slug } }
        });

        if (response.results.length === 0) {
            return res.status(404).send('Projeto não encontrado.');
        }

        const pageId = response.results[0].id;
        const pageTitle = response.results[0].properties.Nome?.title[0]?.plain_text || 'Detalhes do Projeto';
        const renderedHtml = await renderPageById(pageId);
        
        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>${pageTitle}</title>
                <style>body { font-family: sans-serif; } .container { max-width: 800px; margin: 0 auto; padding: 20px; } img { max-width: 100%; height: auto; display: block; margin: 20px 0; }</style>
            </head>
            <body>
                <div class="container">
                    ${renderedHtml}
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Erro ao buscar o projeto:', error.body || error);
        res.status(500).send('Erro ao carregar o projeto.');
    }
});

// Rota para a página Sobre
app.get('/sobre', async (req, res) => {
    const renderedHtml = await renderPageById(process.env.NOTION_SOBRE_PAGE_ID);
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Sobre - Meu Site</title>
            <style>body { font-family: sans-serif; } .container { max-width: 800px; margin: 0 auto; padding: 20px; }</style>
        </head>
        <body>
            <div class="container">
                ${renderedHtml}
            </div>
        </body>
        </html>
    `);
});

// Rota para a página Contato
app.get('/contato', async (req, res) => {
    const renderedHtml = await renderPageById(process.env.NOTION_CONTATO_PAGE_ID);
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Contato - Meu Site</title>
            <style>body { font-family: sans-serif; } .container { max-width: 800px; margin: 0 auto; padding: 20px; }</style>
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