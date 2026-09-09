import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://rtistree.dev',
  integrations: [starlight({
    title: 'Rtistree',
    description: 'Programmable graphics for AI agents. Reproducible scenes, focused edits and built-in art-direction guidance.',
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Coly010/rtistree' }],
    customCss: ['./src/styles/docs.css'],
    sidebar: [{ label: 'Documentation', items: [{ autogenerate: { directory: 'docs' } }] }],
  })],
});
