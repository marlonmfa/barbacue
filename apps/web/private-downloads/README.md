# Downloads privados

Esta pasta fica fora de `public` e nunca deve ser exposta pelo proxy, CDN ou servidor estático. Somente a rota autenticada `/api/admin/downloads/windows` entrega o instalador, para contas com perfil administrador.

Execute `npm run stage:web --workspace=@barbacue/desktop` na raiz após gerar o instalador. O build Windows também executa essa etapa automaticamente. Os binários e o manifesto gerado não são versionados; devem acompanhar o deploy. O Dockerfile copia esta pasta para a imagem final.

Em deploy standalone fora do Docker, copie esta pasta para `apps/web/private-downloads` ao lado do `server.js` web,. A página administrativa informa quando o instalador está indisponível.
