# Cómo publicar una versión nueva

## Estructura del proyecto y ramas

- **`main`** (este repo) = código fuente completo (app + web + docs).
- **`gh-pages`** = solo la web publicada. **Vercel y GitHub Pages sirven desde aquí.**
- **Releases** (etiquetas `vX.Y.Z`) = los instaladores `.exe` + `latest.yml` (auto-update).

## ¿Cambio de contenido o de código?

### A) Solo anuncios / donar / enlaces → SIN versión nueva
Editar `web/appconfig.json` y publicar la rama `gh-pages`. La app lo lee al arrancar.
```bash
# desde una copia de la web en la rama gh-pages
git add appconfig.json && git commit -m "ads: ..." && git push origin gh-pages
```
Listo: todos los usuarios lo reciben en minutos, sin actualizar la app.

### B) Cambios de código (funciones, arreglos) → versión nueva
1. Sube el número en `package.json` (`version`) y en `web/config.js`
   (`version` y el `downloadUrl` a la nueva `vX.Y.Z`). Anótalo en `CHANGELOG.md`.
2. Compila y publica a GitHub Releases:
   ```bash
   GH_TOKEN=ghp_xxx npx electron-builder --win nsis --publish always
   ```
3. electron-builder crea **dos borradores** por una condición de carrera (uno con
   el `.exe` + `latest.yml`, otro con el `.blockmap`). Consolidar por API:
   - Borrar el borrador que solo tiene el `.blockmap`.
   - Subir el `.blockmap` local al borrador principal.
   - Publicar el principal: `PATCH .../releases/{id}` con
     `{"draft":false,"make_latest":"true","target_commitish":"main"}`.
4. Publicar la web actualizada (config.js con la nueva versión) en `gh-pages` y `main`.

Verificación: `latest.yml` de la nueva etiqueta debe decir la versión nueva (eso
dispara el auto-update de quienes tengan la anterior), y la descarga debe dar 200/206.

## Requisitos
- Node + npm, `electron-builder` (ya en devDependencies).
- Un token de GitHub con permiso `repo` (para publicar releases). **No** se guarda
  en el repo; se pasa como variable `GH_TOKEN` en el momento de publicar.
