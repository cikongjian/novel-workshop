import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '..');

const targets = [
  path.join(webDir, 'node_modules', 'element-plus', 'es', 'hooks', 'use-ordered-children', 'index.mjs'),
  path.join(webDir, 'node_modules', 'element-plus', 'lib', 'hooks', 'use-ordered-children', 'index.js'),
];

const BEFORE_VARIANTS = [[
  '  const removeChild = (child) => {',
  '    delete children.value[child.uid];',
  '    triggerRef(children);',
  '    const childNode = child.getVnode().el;',
  '    const parentNode = childNode.parentNode;',
  '    const childNodes = nodesMap.get(parentNode);',
  '    const index = childNodes.indexOf(childNode);',
  '    childNodes.splice(index, 1);',
  '  };',
].join('\n'), [
  '  const removeChild = (child) => {',
  '    delete children.value[child.uid];',
  '    vue.triggerRef(children);',
  '    const childNode = child.getVnode().el;',
  '    const parentNode = childNode.parentNode;',
  '    const childNodes = nodesMap.get(parentNode);',
  '    const index = childNodes.indexOf(childNode);',
  '    childNodes.splice(index, 1);',
  '  };',
].join('\n')];

const AFTER_VARIANTS = [[
  '  const removeChild = (child) => {',
  '    delete children.value[child.uid];',
  '    triggerRef(children);',
  '    const childNode = child.getVnode().el;',
  '    const parentNode = childNode == null ? void 0 : childNode.parentNode;',
  '    if (!parentNode) return;',
  '    const childNodes = nodesMap.get(parentNode);',
  '    if (!childNodes) return;',
  '    const index = childNodes.indexOf(childNode);',
  '    if (index === -1) return;',
  '    childNodes.splice(index, 1);',
  '    if (childNodes.length === 0) nodesMap.delete(parentNode);',
  '  };',
].join('\n'), [
  '  const removeChild = (child) => {',
  '    delete children.value[child.uid];',
  '    vue.triggerRef(children);',
  '    const childNode = child.getVnode().el;',
  '    const parentNode = childNode == null ? void 0 : childNode.parentNode;',
  '    if (!parentNode) return;',
  '    const childNodes = nodesMap.get(parentNode);',
  '    if (!childNodes) return;',
  '    const index = childNodes.indexOf(childNode);',
  '    if (index === -1) return;',
  '    childNodes.splice(index, 1);',
  '    if (childNodes.length === 0) nodesMap.delete(parentNode);',
  '  };',
].join('\n')];

async function patchFile(target) {
  let source;
  try {
    source = await readFile(target, 'utf8');
  } catch {
    return false;
  }

  if (AFTER_VARIANTS.some(variant => source.includes(variant))) {
    return false;
  }

  const matchedIndex = BEFORE_VARIANTS.findIndex(variant => source.includes(variant));
  if (matchedIndex === -1) {
    throw new Error(`Element Plus tabs patch target did not match expected source: ${target}`);
  }

  await writeFile(target, source.replace(BEFORE_VARIANTS[matchedIndex], AFTER_VARIANTS[matchedIndex]), 'utf8');
  return true;
}

const results = await Promise.all(targets.map(patchFile));
if (results.some(Boolean)) {
  console.log('Patched Element Plus tabs unregisterPane guard.');
}
