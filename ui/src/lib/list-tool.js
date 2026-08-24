/**
 * @editorjs/list with a line-preserving conversion config.
 *
 * Upstream, the tool's "Convert to" export joins every list item into ONE
 * string with no separator, and import produces a single item — so converting
 * e.g. a checklist to a bulleted list collapses all lines into one. We export
 * items joined with "\n" and split them back on import, so line structure
 * survives conversions (nesting is flattened; that's the format's limit).
 *
 * Why "\n" and not "<br>": Editor.js sanitises the exported string with the
 * *target* tool's sanitize config before importing, and the list tool defines
 * none — so every tag (including <br>) is stripped. Plain newlines survive.
 */
import List from '@editorjs/list'

/** Depth-first item contents (children flattened after their parent). */
export function listItemsToLines(items) {
  const out = []
  for (const item of items ?? []) {
    out.push(item.content ?? '')
    out.push(...listItemsToLines(item.items))
  }
  return out
}

export function listConversionExport(data) {
  return listItemsToLines(data?.items).join('\n')
}

export function listConversionImport(content, config) {
  const lines = String(content ?? '')
    .split(/<br\s*\/?>|\r?\n/i)
    .map((line) => line.trim())
    .filter((line, i, all) => line !== '' || all.length === 1)
  const items = (lines.length ? lines : ['']).map((line) => ({
    content: line,
    meta: {},
    items: [],
  }))
  return {
    style: config?.defaultStyle !== undefined ? config.defaultStyle : 'unordered',
    meta: {},
    items,
  }
}

export default class CollabList extends List {
  static get conversionConfig() {
    return {
      export: listConversionExport,
      import: listConversionImport,
    }
  }
}
