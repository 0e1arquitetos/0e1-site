// api/index.js

require('dotenv').config();

const express = require('express');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const app = express();
const port = process.env.PORT || 3000;

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
                const h1Text = renderRichText(blockContent.rich_text);
                htmlContent += `<h1>${h1Text}</h1>`;
                break;
            case 'heading_2':
                const h2Text = renderRichText(blockContent.rich_text);
                htmlContent += `<h2>${h2Text}</h2>`;
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
                    const page = await notion.pages.retrieve({ page_id: linkedPageId });
                    const pageTitle = page.properties.title?.title[0]?.plain_text || 'Link';
                    let pageSlug = pageTitle.toLowerCase().replace(/\s/g, '-');

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

async function renderPageById(pageId) {
    try {
        const blocks = await notion.blocks.children.list({ block_id: pageId });
        return await renderBlocksToHtml(blocks.results);
    } catch (error) {
        console.error('Erro ao buscar a página:', error.body || error);
        return '<h1>Erro ao carregar o conteúdo.</h1>';
    }
}

function getLayoutHtml(pageTitle, bodyContent) {
    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>${pageTitle}</title>
            <style>
                body { font-family: sans-serif; margin: 0; padding: 0; }
                .container { max-width: 800px; margin: 0 auto; padding: 20px; }
                .nav-menu { position: fixed; right: 20px; top: 20px; }
                .nav-menu a { display: block; text-decoration: none; color: #333; margin-bottom: 10px; }
                .filter-menu a { text-decoration: none; color: #555; margin-right: 15px; }
                .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
                .card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .card img { width: 100%; height: 200px; object-fit: cover; display: block; }
                .card-content { padding: 16px; }
                footer { text-align: center; margin-top: 40px; padding: 20px; border-top: 1px solid #eee; }
                
                .swiper { width: 100%; height: 100%; }
                .swiper-slide { text-align: center; font-size: 18px; background: #fff; display: flex; justify-content: center; align-items: center; }
                .swiper-slide a { display: block; width: 100%; height: 100%; }
                .swiper-slide img { display: block; width: 100%; height: 100%; object-fit: cover; }
            </style>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@8/swiper-bundle.min.css">
        </head>
        <body>
            <div class="nav-menu">
                <a href="/projetos">Projetos</a>
                <a href="/sobre">Sobre</a>
                <a href="/contato">Contato</a>
            </div>
            <div class="container">
                ${bodyContent}
            </div>
            <footer>
                ZERO E UM | arquitetos
            </footer>
            <script src="https://cdn.jsdelivr.net/npm/swiper@8/swiper-bundle.min.js"></script>
            <script>
                new Swiper('.swiper-home-carousel', {
                    loop: true,
                    autoplay: {
                        delay: 5000,
                        disableOnInteraction: false,
                    },
                });
            </script>
        </body>
        </html>
    `;
}

app.get('/', async (req, res) => {
    const databaseId = process.env.NOTION_DATABASE_ID;
    const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
            property: 'Home',
            checkbox: {
                equals: true
            }
        }
    });

    console.log(JSON.stringify(response.results[0].properties, null, 2));

    let htmlSlides = '';
    response.results.forEach(page => {
        const title = page.properties.Name?.title[0]?.plain_text || page.properties.Nome?.title[0]?.plain_text || 'Sem Título';
        const imageUrl = page.properties.Capa?.files[0]?.file?.url || 'https://via.placeholder.com/400';
        const slug = page.properties.URL?.rich_text[0]?.plain_text || page.id;

        htmlSlides += `
            <div class="swiper-slide">
                <a href="/projetos/${slug}">
                    <img src="${imageUrl}" alt="${title}">
                </a>
            </div>
        `;
    });
    
    const bodyContent = `
        <div class="swiper swiper-home-carousel">
            <div class="swiper-wrapper">
                ${htmlSlides}
            </div>
        </div>
    `;

    res.send(getLayoutHtml('Home - 0e1', bodyContent));
});

app.get('/projetos', async (req, res) => {
    const databaseId = process.env.NOTION_DATABASE_ID;
    const response = await notion.databases.query({ database_id: databaseId });

    const projectTypes = [...new Set(response.results.map(page => page.properties.Tipo?.select?.name || 'Todos'))];
    const filterMenu = `<div class="filter-menu">
        <a href="/projetos?filter=Todos">Todos</a>
        ${projectTypes.filter(type => type !== 'Todos').map(type => `<a href="/projetos?filter=${type}">${type}</a>`).join('')}
    </div>`;

    let htmlCards = '';
    response.results.forEach(page => {
        const title = page.properties.Name?.title[0]?.plain_text || page.properties.Nome?.title[0]?.plain_text || 'Sem Título';
        const year = page.properties.Ano?.number || '';
        const imageUrl = page.properties.Capa?.files[0]?.file?.url || 'https://via.placeholder.com/400';
        const slug = page.properties.URL?.rich_text[0]?.plain_text || page.id;
        const type = page.properties.Tipo?.select?.name || 'Sem Tipo';

        htmlCards += `
            <a href="/projetos/${slug}" style="text-decoration: none; color: inherit;">
                <div class="card">
                    <img src="${imageUrl}" alt="${title}">
                    <div class="card-content">
                        <h3>${title}</h3>
                        <p>${type} • ${year}</p>
                    </div>
                </div>
            </a>
        `;
    });
    
    const bodyContent = `
        <h1>Projetos</h1>
        ${filterMenu}
        <div class="card-grid">
            ${htmlCards}
        </div>
    `;

    res.send(getLayoutHtml('Projetos - 0e1', bodyContent));
});

app.get('/projetos/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const response = await notion.databases.query({
            database_id: process.env.NOTION_DATABASE_ID,
            filter: { property: 'URL', rich_text: { equals: slug } }
        });

        if (response.results.length === 0) {
            return res.status(404).send(getLayoutHtml('404 - Projeto não encontrado', '<h1>Projeto não encontrado.</h1>'));
        }

        const pageId = response.results[0].id;
        const pageTitle = response.results[0].properties.Nome?.title[0]?.plain_text || 'Detalhes do Projeto';
        const renderedHtml = await renderPageById(pageId);
        
        const bodyContent = `<h1>${pageTitle}</h1><hr>${renderedHtml}`;

        res.send(getLayoutHtml(pageTitle, bodyContent));
    } catch (error) {
        console.error('Erro ao buscar o projeto:', error.body || error);
        res.status(500).send(getLayoutHtml('Erro no Servidor', '<h1>Erro ao carregar o projeto.</h1>'));
    }
});

app.get('/sobre', async (req, res) => {
    const renderedHtml = await renderPageById(process.env.NOTION_SOBRE_PAGE_ID);
    const bodyContent = `<h1>Sobre</h1><hr>${renderedHtml}`;
    res.send(getLayoutHtml('Sobre - 0e1', bodyContent));
});

app.get('/contato', async (req, res) => {
    const renderedHtml = await renderPageById(process.env.NOTION_CONTATO_PAGE_ID);
    const bodyContent = `<h1>Contato</h1><hr>${renderedHtml}`;
    res.send(getLayoutHtml('Contato - 0e1', bodyContent));
});

module.exports = app;