// {{nome}}: roda na página, dentro de function (bs, plugin) { ... }. Veja docs/PLUGINS.md do BlueScreen.
const { toast } = bs;

async function saudar() {
  const c = (await plugin.settings.get()) || {};
  toast(`${c.saudacao || 'Olá'} do {{nome}}!`, 'ok');
}

bs.actions.add([{ label: '{{nome}}: dizer olá', run: saudar }]);
plugin.onUnload(() => {});
