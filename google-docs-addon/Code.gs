const ADDON_NAME = 'Umbrella Parade Writer';

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Umbrella Parade')
    .addItem('サイドバーを開く', 'showSidebar')
    .addItem('大きい表示で開く', 'showWidePreview')
    .addSeparator()
    .addItem('選択文字にルビ記法を入れる', 'showRubyPrompt')
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle(ADDON_NAME);
  DocumentApp.getUi().showSidebar(html);
}

function showWidePreview() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle(`${ADDON_NAME} 大きい表示`)
    .setWidth(980)
    .setHeight(760);
  DocumentApp.getUi().showModelessDialog(html, `${ADDON_NAME} 大きい表示`);
}

function showRubyPrompt() {
  const ui = DocumentApp.getUi();
  const base = getSelectedText();
  const rubyPrompt = ui.prompt('ルビ', `${base || '選択文字'} のふりがなを入力してください`, ui.ButtonSet.OK_CANCEL);
  if (rubyPrompt.getSelectedButton() !== ui.Button.OK) return;

  insertRubyMarkup({
    base: base || '漢字',
    ruby: rubyPrompt.getResponseText() || 'ふりがな',
  });
}

function getDocumentSnapshot() {
  const document = DocumentApp.getActiveDocument();
  const body = document.getBody();
  const blocks = [];
  const toc = [];
  const links = [];

  for (let index = 0; index < body.getNumChildren(); index += 1) {
    readElement(body.getChild(index), blocks, toc, links);
  }

  blocks
    .filter((block) => block.type === 'toc')
    .forEach((block) => {
      block.items = toc.slice();
    });

  const text = blocks
    .filter((block) => block.type !== 'pageBreak' && block.type !== 'toc')
    .map((block) => block.text || '')
    .join('\n');

  return {
    title: document.getName(),
    blocks,
    toc,
    links,
    characterCount: text.replace(/\s/g, '').length,
    updatedAt: new Date().toISOString(),
  };
}

function getSelectedText() {
  const selection = DocumentApp.getActiveDocument().getSelection();
  if (!selection) return '';

  return selection
    .getRangeElements()
    .map((rangeElement) => {
      const element = rangeElement.getElement();
      if (element.getType() !== DocumentApp.ElementType.TEXT) return '';

      const text = element.asText();
      if (!rangeElement.isPartial()) return text.getText();

      const start = rangeElement.getStartOffset();
      const end = rangeElement.getEndOffsetInclusive();
      return text.getText().slice(start, end + 1);
    })
    .join('')
    .trim();
}

function insertRubyMarkup(payload) {
  const base = String(payload && payload.base ? payload.base : '').trim();
  const ruby = String(payload && payload.ruby ? payload.ruby : '').trim();
  if (!base || !ruby) throw new Error('ルビを入れる文字とふりがなを入力してください。');

  const document = DocumentApp.getActiveDocument();
  const markup = `｜${base}《${ruby}》`;
  const selection = document.getSelection();

  if (selection) {
    const ranges = selection.getRangeElements();
    if (ranges.length === 1 && ranges[0].getElement().getType() === DocumentApp.ElementType.TEXT) {
      const range = ranges[0];
      const text = range.getElement().asText();
      if (range.isPartial()) {
        const start = range.getStartOffset();
        const end = range.getEndOffsetInclusive();
        text.deleteText(start, end);
        text.insertText(start, markup);
        return { ok: true, message: 'ルビ記法を挿入しました。' };
      }
    }
  }

  const cursor = document.getCursor();
  if (cursor) {
    cursor.insertText(markup);
    return { ok: true, message: 'カーソル位置にルビ記法を挿入しました。' };
  }

  document.getBody().appendParagraph(markup);
  return { ok: true, message: '文末にルビ記法を挿入しました。' };
}

function insertLinkedText(payload) {
  const label = String(payload && payload.label ? payload.label : '').trim();
  const url = String(payload && payload.url ? payload.url : '').trim();
  if (!label || !/^https?:\/\//i.test(url)) throw new Error('表示文字とURLを入力してください。');

  const document = DocumentApp.getActiveDocument();
  const cursor = document.getCursor();
  if (cursor) {
    const inserted = cursor.insertText(label);
    inserted.setLinkUrl(url);
    return { ok: true, message: 'リンクを挿入しました。' };
  }

  const paragraph = document.getBody().appendParagraph(label);
  paragraph.editAsText().setLinkUrl(0, label.length - 1, url);
  return { ok: true, message: '文末にリンクを挿入しました。' };
}

function readElement(element, blocks, toc, links) {
  const type = element.getType();

  if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
    readParagraph(element, blocks, toc, links);
    return;
  }

  if (type === DocumentApp.ElementType.TABLE_OF_CONTENTS) {
    blocks.push({
      type: 'toc',
      text: '',
      items: [],
    });
    return;
  }

  if (type === DocumentApp.ElementType.PAGE_BREAK) {
    blocks.push({ type: 'pageBreak', text: '' });
    return;
  }

  if (type === DocumentApp.ElementType.TABLE) {
    const table = element.asTable();
    for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex += 1) {
      const row = table.getRow(rowIndex);
      for (let cellIndex = 0; cellIndex < row.getNumCells(); cellIndex += 1) {
        const cell = row.getCell(cellIndex);
        for (let childIndex = 0; childIndex < cell.getNumChildren(); childIndex += 1) {
          readElement(cell.getChild(childIndex), blocks, toc, links);
        }
      }
    }
  }
}

function readParagraph(element, blocks, toc, links) {
  const paragraph = element.getType() === DocumentApp.ElementType.LIST_ITEM
    ? element.asListItem()
    : element.asParagraph();
  const headingLevel = getHeadingLevel(paragraph);
  const blockType = element.getType() === DocumentApp.ElementType.LIST_ITEM ? 'listItem' : 'paragraph';
  let segments = [];
  let headingRegistered = false;

  for (let childIndex = 0; childIndex < paragraph.getNumChildren(); childIndex += 1) {
    const child = paragraph.getChild(childIndex);
    const childType = child.getType();

    if (childType === DocumentApp.ElementType.TEXT) {
      segments = segments.concat(readTextSegments(child.asText(), links));
      continue;
    }

    if (childType === DocumentApp.ElementType.PAGE_BREAK) {
      headingRegistered = pushParagraphBlock({
        blocks,
        toc,
        blockType,
        headingLevel,
        segments,
        headingRegistered,
      });
      blocks.push({ type: 'pageBreak', text: '' });
      segments = [];
    }
  }

  pushParagraphBlock({
    blocks,
    toc,
    blockType,
    headingLevel,
    segments,
    headingRegistered,
    allowEmpty: true,
  });
}

function getHeadingLevel(paragraph) {
  const heading = paragraph.getHeading();
  if (heading === DocumentApp.ParagraphHeading.HEADING1) return 1;
  if (heading === DocumentApp.ParagraphHeading.HEADING2) return 2;
  if (heading === DocumentApp.ParagraphHeading.HEADING3) return 3;
  return 0;
}

function pushParagraphBlock(payload) {
  const segments = mergeAdjacentSegments(payload.segments || []);
  const text = segments.map((segment) => segment.text).join('');
  if (!payload.allowEmpty && !text) return payload.headingRegistered;

  const hasHeading = payload.headingLevel && !payload.headingRegistered;
  const block = {
    type: payload.blockType,
    text,
    segments,
    headingLevel: payload.headingLevel,
    id: hasHeading ? `heading-${payload.toc.length + 1}` : '',
  };

  if (hasHeading) {
    payload.toc.push({
      id: block.id,
      title: text || '(無題の見出し)',
      level: payload.headingLevel,
    });
  }

  payload.blocks.push(block);
  return payload.headingRegistered || Boolean(hasHeading);
}

function readTextSegments(textElement, links) {
  const value = textElement.getText();
  if (!value) return [];

  const segments = [];
  let activeUrl = textElement.getLinkUrl(0) || '';
  let start = 0;

  for (let index = 1; index <= value.length; index += 1) {
    const url = index < value.length ? textElement.getLinkUrl(index) || '' : null;
    if (url === activeUrl) continue;

    const label = value.slice(start, index);
    segments.push({
      text: label,
      url: activeUrl,
    });

    if (activeUrl) {
      links.push({
        label,
        url: activeUrl,
      });
    }

    activeUrl = url || '';
    start = index;
  }

  return segments;
}

function mergeAdjacentSegments(segments) {
  return segments.reduce((merged, segment) => {
    if (!segment.text) return merged;

    const previous = merged[merged.length - 1];
    if (previous && previous.url === segment.url) {
      previous.text += segment.text;
    } else {
      merged.push({
        text: segment.text,
        url: segment.url || '',
      });
    }

    return merged;
  }, []);
}
