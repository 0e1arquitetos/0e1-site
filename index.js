// index.js

require('dotenv').config();

const express = require('express');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const app = express();
const port = process.env.PORT || 3000;

// Função auxiliar para renderizar Rich Text com links
function renderRichText(richTextArray) {
    let html = '';
    richTextArray.forEach(text => {
        if (text.href) {
            html += `<a href="${text.href}">${text.plain_text}</a>`;
        } else {
            html += text.plain_text;
        }
    });
    return html;
}

// Esta função agora é assíncrona para buscar o conteúdo de blocos sincronizados e de links
async function renderBlocksToHtml(blocks) {
    let htmlContent = '';

    for (const block of blocks) {
        const blockType = block.type;
        const blockContent = block[blockType];

        switch (blockType) {
            case 'paragraph':
                htmlContent += `<p>${renderRichText(blockContent.rich_text)}</p>`;
                break;
            case 'heading_1':
                htmlContent += `<h1>${renderRichText(blockContent.rich_text)}</h1>`;
                break;
            case 'heading_2':
                htmlContent += `<h2>${renderRichText(blockContent.rich_text)}</h2>`;
                break;
            case 'image':
                const imageUrl = blockContent.file?.url || blockContent.external?.url;
                htmlContent += `<img src="${imageUrl}" alt="Imagem do Notion" style="max-width: 100%; height: auto;">`;
                break;
            case 'toggle':
                const toggleTitle = renderRichText(blockContent.rich_text);
                htmlContent += `<details><summary><h3>${toggleTitle}</h3></summary></details>`;
                break;
            case 'child_database':
                htmlContent += `<p>[Conteúdo de base de dados embutida. Requer uma requisição separada para ser exibido.]</p>`;
                break;
            case 'child_page':
                // A navegação entre páginas já é feita nas rotas do Express.
                htmlContent += `<h4><a href="/${blockContent.title.toLowerCase().replace(/\s/g, '-')}" >${blockContent.title}</a></h4>`;
                break;
            case 'synced_block':
                if (blockContent.synced_from) {
                    const syncedBlockId = blockContent.synced_from.block_id;
                    const syncedChildren = await notion.blocks.children.list({ block_id: syncedBlockId });
                    htmlContent += await renderBlocksToHtml(syncedChildren.results);
                }
                break;
            case 'link_to_page':
                const linkedPageId = blockContent.page_id;
                try {
                    // Busca as propriedades da página para obter o título
                    const page = await notion.pages.retrieve({ page_id: linkedPageId });
                    const pageTitle = page.properties.title?.title[0]?.plain_text || 'Link';
                    let pageSlug = pageTitle.toLowerCase().replace(/\s/g, '-');

                    // Verifica se o link é para uma página de projeto
                    const databaseResponse = await notion.databases.query({
                        database_id: process.env.NOTION_DATABASE_ID,
                        filter: { property: 'URL', rich_text: { equals: page.properties.URL?.rich_text[0]?.plain_text || page.id } }
                    });

                    if (databaseResponse.results.length > 0) {
                        pageSlug = `projetos/${databaseResponse.results[0].properties.URL?.rich_text[0]?.plain_text}`;
                    }
                    
                    htmlContent += `<h4><a href="/${pageSlug}">${pageTitle}</a></h4>`;

                } catch (error) {
                    console.error(`Erro ao buscar página com ID ${linkedPageId}:`, error.body || error);
                    htmlContent += `<h4>Link Quebrado</h4>`;
                }
                break;
            default:
                console.log(`Tipo de bloco não suportado: ${blockType}`);
                break;
        }
    }
    return htmlContent;
}

// Esta função também se torna assíncrona por chamar a função de renderização
async function renderPageById(pageId) {
    try {
        const blocks = await notion.blocks.children.list({ block_id: pageId });
        return await renderBlocksToHtml(blocks.results);
    } catch (error) {
        console.error('Erro ao buscar a página:', error.body || error);
        return '<h1>Erro ao carregar o conteúdo.</h1>';
    }
}


// --- ROTAS DO SERVIDOR ---

app.get('/', async (req, res) => {
    const renderedStaticHtml = await renderPageById(process.env.NOTION_HOME_PAGE_ID);
    
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

app.get('/projetos', async (req, res) => {
    const renderedStaticHtml = await renderPageById(process.env.NOTION_PROJETOS_PAGE_ID);

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

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});