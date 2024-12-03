function Highlighter(options = hhDefaultOptions) {
  for (const key of Object.keys(hhDefaultOptions)) {
    options[key] = options[key] ?? hhDefaultOptions[key];
  }
  const annotatableContainer = document.querySelector(options.containerSelector);
  const annotatableParagraphs = document.querySelectorAll(options.paragraphSelector);
  const isSafari = /^((?!Chrome|Firefox|Android|Samsung).)*AppleWebKit/i.test(navigator.userAgent);
  const isIosSafari = isSafari && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
  
  // Setting -1 as the tabIndex on <body> is a workaround to avoid "tap to search" in Chrome on Android
  document.body.tabIndex = -1;
  
  // Set up stylesheets
  const generalStylesheet = new CSSStyleSheet();
  const highlightsStylesheet = new CSSStyleSheet();
  const selectionStylesheet = new CSSStyleSheet();
  document.adoptedStyleSheets.push(generalStylesheet);
  document.adoptedStyleSheets.push(highlightsStylesheet);
  document.adoptedStyleSheets.push(selectionStylesheet);
  generalStylesheet.replaceSync(`
    body {
      -webkit-user-select: none;
      user-select: none;
    }
    ${options.containerSelector} {
      position: relative;
      -webkit-user-select: text;
      user-select: text;
    }
    ${options.containerSelector} rt,
    ${options.containerSelector} sup,
    ${options.containerSelector} sub,
    ${options.containerSelector} img {
      -webkit-user-select: none;
      user-select: none;
    }
    .hh-wrapper-start, .hh-wrapper-end {
      position: relative;
      -webkit-user-select: none;
      user-select: none;
    }
    .hh-svg-background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
    }
    .hh-svg-background g {
      fill: transparent;
      stroke: none;
    }
  `);
  
  // Set up SVG background
  const svgBackground = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgBackground.classList.add('hh-svg-background');
  annotatableContainer.appendChild(svgBackground);
  
  // Check for hyperlinks on the page
  const hyperlinkElements = annotatableContainer.getElementsByTagName('a');
  const hyperlinksByPosition = {}
  for (let hyp = 0; hyp < hyperlinkElements.length; hyp++) {
    hyperlinksByPosition[hyp] = {
      'position': hyp,
      'text': hyperlinkElements[hyp].innerHTML,
      'url': hyperlinkElements[hyp].href,
      'hyperlinkElement': hyperlinkElements[hyp],
    }
  }
  
  const highlightsById = {};
  let annotatableContainerClientRect = annotatableContainer.getBoundingClientRect();
  let activeHighlightId = null;
  let previousSelectionRange = null;
  let isStylus = false;
  let selectionIsReady = false;
  
  
  // -------- PUBLIC METHODS --------
  
  // Load highlights
  this.loadHighlights = (highlights) => {
    // Load read-only highlights first (read-only highlights change the DOM, affecting other highlights' ranges)
    const sortedHighlights = highlights.sort((a,b) => a.readOnly == b.readOnly ? 0 : a.readOnly ? -1 : 1);
    const knownHighlightIds = Object.keys(highlightsById);
    let addedCount = 0; let updatedCount = 0;
    for (const highlight of sortedHighlights) {
      const highlightInfo = diffHighlight(highlight, highlightsById[highlight.highlightId]);
      highlightInfo.highlightId = highlight.highlightId;
      const knownHighlightIndex = knownHighlightIds.indexOf(highlightInfo.highlightId);
      if (knownHighlightIndex > -1) {
        knownHighlightIds.splice(knownHighlightIndex, 1);
        if (Object.keys(highlightInfo).length > 1) {
          this.createOrUpdateHighlight(highlightInfo, false); updatedCount++;
        }
      } else {
        this.createOrUpdateHighlight(highlightInfo, false); addedCount++;
      }
    }
    if (knownHighlightIds.length > 0) this.removeHighlights(knownHighlightIds);
    annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightsload', { detail: { addedCount: addedCount, removedCount: knownHighlightIds.length, updatedCount: updatedCount, totalCount: Object.keys(highlightsById).length } }));
  }
  
  // Draw (or redraw) specified highlights, or all highlights on the page
  this.drawHighlights = (highlightIds = Object.keys(highlightsById)) => {
    for (const highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      const range = getRestoredHighlightRange(highlightInfo);
      const wasDrawnAsReadOnly = document.querySelector(`.hh-read-only[data-highlight-id="${highlightId}"]`);
      
      // Remove old highlight elements and styles
      if (!wasDrawnAsReadOnly || (wasDrawnAsReadOnly && !highlightInfo.readOnly)) undrawHighlight(highlightInfo);
      
      if (highlightInfo.readOnly) {
        let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'css');
        highlightsStylesheet.insertRule(`.hh-read-only[data-highlight-id="${highlightId}"] { ${styleTemplate} }`);
        
        // Don't redraw a read-only highlight
        if (wasDrawnAsReadOnly) continue;
        
        // Inject HTML <span> elements
        range.startContainer.splitText(range.startOffset);
        range.endContainer.splitText(range.endOffset);
        const textNodeIter = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
        const relevantTextNodes = [];
        while (node = textNodeIter.nextNode()) {
          if (range.intersectsNode(node) && node !== range.startContainer && node.textContent != '') relevantTextNodes.push(node);
          if (node === range.endContainer) break;
        }
        for (const textNode of relevantTextNodes) {
          const styledSpan = document.createElement('span');
          styledSpan.classList.add('hh-read-only');
          styledSpan.dataset.highlightId = highlightId;
          textNode.before(styledSpan);
          styledSpan.appendChild(textNode);
        }
        document.querySelectorAll(`#${highlightInfo.startParagraphId}, #${highlightInfo.endParagraphId}`).forEach(p => { p.normalize(); });
      } else {        
        // Draw highlights with Custom Highlight API
        if (options.drawingMode == 'highlight-api') {
          if (CSS.highlights.has(highlightId)) {
            highlightObj = CSS.highlights.get(highlightId);
            highlightObj.clear();
          } else {
            highlightObj = new Highlight();
            CSS.highlights.set(highlightId, highlightObj);
          }
          highlightObj.add(range);
          let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'css');
          highlightsStylesheet.insertRule(`::highlight(${highlightInfo.escapedHighlightId}) { ${styleTemplate} }`);
          highlightsStylesheet.insertRule(`rt::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightsStylesheet.insertRule(`sup::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightsStylesheet.insertRule(`sub::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
          highlightsStylesheet.insertRule(`img::highlight(${highlightInfo.escapedHighlightId}) { color: inherit; background-color: transparent; }`);
        
        // Draw highlights with SVG shapes
        } else if (options.drawingMode == 'svg') {
          let styleTemplate = getStyleTemplate(highlightInfo.color, highlightInfo.style, 'svg');
          const clientRects = range.getClientRects();
          const mergedClientRects = getMergedDomRects(clientRects, lineRoundN = 10);
          let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          group.dataset.highlightId = highlightId;
          svgContent = '';
          for (const clientRect of mergedClientRects) {
            svgContent += styleTemplate
            .replaceAll('{x}', clientRect.x - annotatableContainerClientRect.x + window.scrollX)
            .replaceAll('{y}', clientRect.y - annotatableContainerClientRect.y + window.scrollY)
            .replaceAll('{width}', clientRect.width).replaceAll('{height}', clientRect.height)
            .replaceAll('{top}', clientRect.top).replaceAll('{bottom}', clientRect.bottom + window.scrollY)
            .replaceAll('{left}', clientRect.left).replaceAll('{right}', clientRect.right + window.scrollX);
          }
          group.innerHTML = svgContent;
          svgBackground.appendChild(group);
        }
      }
      
      // Update wrapper
      // TODO: Enable wrappers for editable highlights
      if (highlightInfo.readOnly && !wasDrawnAsReadOnly) {
        if (highlightInfo.wrapper && (options.wrappers[highlightInfo.wrapper]?.start || options.wrappers[highlightInfo.wrapper]?.end)) {
          function addWrapper(edge, range, htmlString) {
            htmlString = `<span class="hh-wrapper-${edge}" data-highlight-id="${highlightId}">${htmlString}</span>`
            htmlString = htmlString.replaceAll('{color}', options.colors[highlightInfo.color]);
            for (const key of Object.keys(highlightInfo.wrapperVariables)) {
              htmlString = htmlString.replaceAll(`{${key}}`, highlightInfo.wrapperVariables[key]);
            }
            const template = document.createElement('template');
            template.innerHTML = htmlString;
            let htmlElement = template.content.firstChild;
            
            const textNodeIter = document.createNodeIterator(htmlElement, NodeFilter.SHOW_TEXT);
            while (node = textNodeIter.nextNode()) node.parentNode.removeChild(node);
            range.insertNode(htmlElement);
            
          }
          const startRange = highlightInfo.highlightRange;
          const endRange = document.createRange(); endRange.setStart(highlightInfo.highlightRange.endContainer, highlightInfo.highlightRange.endOffset);
          const wrapperInfo = options.wrappers[highlightInfo.wrapper];
          addWrapper('start', startRange, wrapperInfo.start);
          addWrapper('end', endRange, wrapperInfo.end);
          
          document.querySelectorAll(`#${highlightInfo.startParagraphId}, #${highlightInfo.endParagraphId}`).forEach(p => { p.normalize(); });
        }
      }
      
    }
  }
  
  // Create a new highlight, or update an existing highlight when it changes
  this.createOrUpdateHighlight = (attributes = {}, triggeredByUserAction = true) => {
    let highlightId = attributes.highlightId ?? activeHighlightId ?? options.highlightIdFunction();
    appearanceChanges = [];
    boundsChanges = [];
    
    let isNewHighlight, oldHighlightInfo;
    if (highlightsById.hasOwnProperty(highlightId)) {
      oldHighlightInfo = highlightsById[highlightId];
    } else {
      isNewHighlight = true;
    }
    
    // If a different highlight is active, deactivate it
    if (activeHighlightId && highlightId != activeHighlightId) this.deactivateHighlights();
    
    // Update defaults
    if (options.rememberStyle && triggeredByUserAction) {
      if (attributes.color) options.defaultColor = attributes.color;
      if (attributes.style) options.defaultStyle = attributes.style;
      if (attributes.wrapper) options.defaultWrapper = attributes.wrapper;
    }
    
    // Check which appearance properties changed
    for (const key of ['color', 'style', 'wrapper', 'wrapperVariables', 'readOnly']) {
      if (isNewHighlight || (attributes[key] != null && attributes[key] != oldHighlightInfo[key])) appearanceChanges.push(key);
    }
    
    // If the highlight was and still is read-only, return
    if (oldHighlightInfo?.readOnly && (attributes.readOnly == null || attributes.readOnly === true)) return this.deactivateHighlights();
    
    // Calculate the bounds of the highlight range, if it's changed
    let selectionRange, highlightRange;
    let startParagraphId, startParagraphOffset, endParagraphId, endParagraphOffset;
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    if (selection.type == 'Range') selectionRange = selection.getRangeAt(0);
    if ((attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) || selectionRange) {
      let startNode, startOffset, endNode, endOffset;
      if (attributes.startParagraphId ?? attributes.startParagraphOffset ?? attributes.endParagraphId ?? attributes.endParagraphOffset != null) {
        startParagraphId = attributes.startParagraphId ?? oldHighlightInfo?.startParagraphId;
        startParagraphOffset = parseInt(attributes.startParagraphOffset ?? oldHighlightInfo?.startParagraphOffset);
        endParagraphId = attributes.endParagraphId ?? oldHighlightInfo?.endParagraphId;
        endParagraphOffset = parseInt(attributes.endParagraphOffset ?? oldHighlightInfo?.endParagraphOffset);
        ([ startNode, startOffset ] = getTextNodeOffset(document.getElementById(startParagraphId), startParagraphOffset));
        ([ endNode, endOffset ] = getTextNodeOffset(document.getElementById(endParagraphId), endParagraphOffset));
      } else if (selectionRange) {
        startNode = selectionRange.startContainer;
        startOffset = selectionRange.startOffset;
        endNode = selectionRange.endContainer;
        endOffset = selectionRange.endOffset;
        ([ startParagraphId, startParagraphOffset ] = getParagraphOffset(startNode, startOffset));
        ([ endParagraphId, endParagraphOffset ] = getParagraphOffset(endNode, endOffset));
      }
      
      // Create a new highlight range
      highlightRange = document.createRange();
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
      if (options.snapToWord) highlightRange = snapRangeToWord(highlightRange);
      
      // If there are any issues with the range, set the highlight back to how it was
      if (startNode == null || startOffset == null || endNode == null || endOffset == null || startParagraphId == null || startParagraphOffset == null || endParagraphId == null || endParagraphOffset == null || highlightRange.toString() == '') {
        return isNewHighlight ? null : this.createOrUpdateHighlight(oldHighlightInfo);
      }
      
      // Check which bounds properties changed
      for (const key of ['startParagraphId', 'startParagraphOffset', 'endParagraphId', 'endParagraphOffset']) {
        if (isNewHighlight || eval(key) != oldHighlightInfo[key]) boundsChanges.push(key);
      }
    }
    
    // If there are no changes, return
    if (isNewHighlight && boundsChanges.length == 0 || appearanceChanges.length + boundsChanges.length == 0) return;
    
    // Update saved highlight info
    const temporaryHtmlElement = document.createElement('div');
    temporaryHtmlElement.appendChild((highlightRange ?? oldHighlightInfo?.highlightRange).cloneContents());
    for (const hyperlink of temporaryHtmlElement.querySelectorAll('a')) hyperlink.setAttribute('onclick', 'event.preventDefault();');
    const newHighlightInfo = {
      highlightId: highlightId,
      color: attributes?.color ?? oldHighlightInfo?.color ?? options.defaultColor,
      style: attributes?.style ?? oldHighlightInfo?.style ?? options.defaultStyle,
      wrapper: attributes?.wrapper ?? oldHighlightInfo?.wrapper ?? options.defaultWrapper,
      wrapperVariables: attributes?.wrapperVariables ?? oldHighlightInfo?.wrapperVariables ?? {},
      readOnly: attributes?.readOnly ?? oldHighlightInfo?.readOnly ?? false,
      startParagraphId: startParagraphId ?? oldHighlightInfo?.startParagraphId,
      startParagraphOffset: startParagraphOffset ?? oldHighlightInfo?.startParagraphOffset,
      endParagraphId: endParagraphId ?? oldHighlightInfo?.endParagraphId,
      endParagraphOffset: endParagraphOffset ?? oldHighlightInfo?.endParagraphOffset,
      text: (highlightRange ?? oldHighlightInfo?.highlightRange).toString(),
      html: temporaryHtmlElement.innerHTML,
      escapedHighlightId: CSS.escape(highlightId),
      highlightRange: highlightRange ?? oldHighlightInfo?.highlightRange,
    };
    highlightsById[highlightId] = newHighlightInfo;
    
    const detail = {
      highlight: newHighlightInfo,
      changes: appearanceChanges.concat(boundsChanges),
    }
    if (isNewHighlight) {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightcreate', { detail: detail }));
    } else {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightupdate', { detail: detail }));
    }
    
    this.drawHighlights([highlightId]);
    if (triggeredByUserAction) {
      if (appearanceChanges.length > 0) updateSelectionStyle(newHighlightInfo.color, newHighlightInfo.style);
      if (highlightId != activeHighlightId) this.activateHighlight(highlightId);
    }
    return newHighlightInfo;
  }
  
  // Activate a highlight by ID
  this.activateHighlight = (highlightId) => {
    // TODO: Show custom selection handles in desktop browser
    const selection = window.getSelection();
    const highlightToActivate = highlightsById[highlightId];
    if (highlightToActivate.readOnly) {
      // If the highlight is read-only, return an event, but don't actually activate it
      return annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
    }
    const highlightRange = highlightToActivate.highlightRange.cloneRange();
    updateSelectionStyle(highlightToActivate.color, highlightToActivate.style);
    if (selection.type != 'Range') {
      selection.removeAllRanges();
      selection.addRange(highlightRange);
    }
    activeHighlightId = highlightId;
    annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightactivate', { detail: { highlight: highlightToActivate } }));
  }
  
  // Activate a link by position
  let allowHyperlinkClick = false;
  this.activateHyperlink = (position) => {
    this.deactivateHighlights();
    allowHyperlinkClick = true;
    hyperlinksByPosition[position].hyperlinkElement.click();
    allowHyperlinkClick = false;
  }
  
  // Deactivate any highlights that are currently active/selected
  this.deactivateHighlights = () => {
    const deactivatedHighlight = highlightsById[activeHighlightId];
    activeHighlightId = null;
    previousSelectionRange = null;
    window.getSelection().removeAllRanges();
    updateSelectionStyle();
    if (deactivatedHighlight) {
      annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightdeactivate', { detail: {
        highlight: deactivatedHighlight,
      }}));
    }
  }
  
  // Remove the specified highlights, or all highlights on the page
  this.removeHighlights = (highlightIds = Object.keys(highlightsById)) => {
    this.deactivateHighlights();
    for (const highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      if (highlightInfo) {
        delete highlightsById[highlightId];
        annotatableContainer.dispatchEvent(new CustomEvent('hh:highlightremove', { detail: {
          highlightId: highlightId,
        }}));
        undrawHighlight(highlightInfo);
      }
    }
  }
  
  // Get the active highlight ID (if there is one)
  this.getActiveHighlightId = () => {
    return activeHighlightId;
  }
  
  // Get info for specified highlights, or all highlights on the page
  this.getHighlightInfo = (highlightIds = Object.keys(highlightsById), paragraphId = null) => {
    let filteredHighlights = []
    for (highlightId of highlightIds) {
      const highlightInfo = highlightsById[highlightId];
      if (!paragraphId || paragraphId == highlightInfo.startParagraphId) {
        filteredHighlights.push(highlightInfo);
      }
    }
    // Sort highlights based on their order on the page
    if (filteredHighlights.length > 0) {
      let orderedElementIds = Array.from(annotatableContainer.querySelectorAll('[id]'), node => node.id);
      filteredHighlights.sort((a, b) => {
        return (orderedElementIds.indexOf(a.startParagraphId) - orderedElementIds.indexOf(b.startParagraphId)) || (a.startParagraphOffset - b.startParagraphOffset);
      });
    }
    return filteredHighlights;
  }
  
  // Update one of the initialized options
  this.setOption = (key, value) => {
    options[key] = value ?? options[key];
    if (key == 'drawingMode') {
      if (CSS.highlights) CSS.highlights.clear();
      this.drawHighlights();
    }
  }
  
  // Get all of the initialized options
  this.getOptions = () => {
    return options;
  }
  
    
  // -------- EVENT LISTENERS --------
  
  // Selection change in document (new selection, change in selection range, or selection collapsing to a caret)
  document.addEventListener('selectionchange', (event) => respondToSelectionChange(event));
  const respondToSelectionChange = (event) => {
    const selection = getRestoredSelectionOrCaret(window.getSelection());
    // Deselect text or deactivate highlights when tapping away
    if (previousSelectionRange && selection.type == 'Caret' && previousSelectionRange.comparePoint(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset) != 0) {
      this.deactivateHighlights();
    }
    
    if (selection.type == 'Range') {
      selectionIsReady = true;
      const selectionRange = selection.getRangeAt(0);
      let color = highlightsById[activeHighlightId]?.color ?? options.defaultColor;
      let style = highlightsById[activeHighlightId]?.style ?? options.defaultStyle;
      if (!activeHighlightId && (options.pointerMode == 'live' || (options.pointerMode == 'auto' && isStylus == true))) {
        this.createOrUpdateHighlight();
      }
      if (activeHighlightId) this.createOrUpdateHighlight({ highlightId: activeHighlightId, });
      previousSelectionRange = selectionRange.cloneRange();
    }
  }
  
  // Pointer down in annotatable container
  tapResult = null;
  annotatableContainer.addEventListener('pointerdown', (event) => respondToPointerDown(event));
  const respondToPointerDown = (event) => {
    isStylus = event.pointerType == 'pen';
    const tapRange = getRangeFromTapEvent(event);
    tapResult = checkForTapTargets(tapRange);
  }
  
  // Hyperlink click (for each hyperlink in annotatable container)
  for (const hyperlinkElement of hyperlinkElements) {
    hyperlinkElement.addEventListener('click', (event) => {
      this.deactivateHighlights();
      if (!allowHyperlinkClick) event.preventDefault();
    });
  }
  
  // Pointer up in annotatable container
  annotatableContainer.addEventListener('pointerup', (event) => respondToPointerUp(event));
  const respondToPointerUp = (event) => {
    const selection = window.getSelection();
    if (tapResult && !activeHighlightId && selection.type != 'Range') {
      if (tapResult.highlights.length == 1 && tapResult.hyperlinks.length == 0) {
        return this.activateHighlight(tapResult.highlights[0].highlightId);
      } else if (tapResult.highlights.length == 0 && tapResult.hyperlinks.length == 1) {
        return this.activateHyperlink(tapResult.hyperlinks[0].position);
      } else if (tapResult.highlights.length + tapResult.hyperlinks.length > 1) {
        return annotatableContainer.dispatchEvent(new CustomEvent('hh:ambiguousaction', { detail: tapResult, }));
      }
    }
    tapResult = null;
  }
  
  // Pointer up in window
  window.addEventListener('pointerup', respondToWindowPointerUp);
  function respondToWindowPointerUp(event) {
    const selection = window.getSelection();
    if (selection.type == 'Range' && options.snapToWord) {
      const selectionRange = snapRangeToWord(selection.getRangeAt(0)).cloneRange();
      selection.removeAllRanges();
      selection.addRange(selectionRange);
    }
    
    // TODO: If you attempt to select any text programmatically before the user has long-pressed to create a selection (for example, if you tap an existing highlight after the page loads), iOS Safari selects the text, but it doesn't show the selection UI (selection handles and selection overlay). This workaround opens a temporary tab and closes it, to force Safari to re-focus the original page, which causes the selection UI to show as expected. A better workaround or fix is needed.
    if (isIosSafari) {
      if (!selectionIsReady) {
        const tempTab = window.open('', 'temporary');
        tempTab.document.body.innerHTML = '<meta name="viewport" content="width=device-width, user-scalable=yes, initial-scale=1.0">Workaround for initial text selection on iOS Safari...';
        setTimeout(() => {
          tempTab.close();
          selectionIsReady = true;
        }, 500);
      }
    }
  }
  
  // Window resize
  window.addEventListener('resize', (event) => respondToWindowResize(event));
  const respondToWindowResize = (event) => {
    annotatableContainerClientRect = annotatableContainer.getBoundingClientRect();
    if (options.drawingMode == 'svg') this.drawHighlights();
  }
  
  // Window blur
  window.addEventListener('blur', (event) => selectionIsReady = false)
  
  
  // -------- UTILITY FUNCTIONS --------
    
  // Check if the tap is in the range of an existing highlight or link
  const checkForTapTargets = (tapRange) => {
    if ((Object.keys(highlightsById).length + Object.keys(hyperlinksByPosition).length) == 0) return;
    
    // Check for tapped highlights and hyperlinks
    const tappedHighlights = [];
    for (const highlightId of Object.keys(highlightsById)) {
      const highlightInfo = highlightsById[highlightId];
      const highlightRange = highlightInfo.highlightRange;
      if (highlightRange.comparePoint(tapRange.startContainer, tapRange.startOffset) == 0) {
        tappedHighlights.push(highlightInfo);
      }
    }
    const tappedHyperlinks = [];
    for (const hyperlinkPosition of Object.keys(hyperlinksByPosition)) {
      const hyperlinkInfo = hyperlinksByPosition[hyperlinkPosition];
      const hyperlinkRange = document.createRange()
      hyperlinkRange.selectNodeContents(hyperlinkInfo.hyperlinkElement);
      if (hyperlinkRange.comparePoint(tapRange.startContainer, tapRange.startOffset) == 0) {
        tappedHyperlinks.push(hyperlinkInfo);
      }
    }
    
    // Sort highlights (hyperlinks should already be sorted)
    const tappedHyperlinkIds = [];
    for (const highlightInfo of tappedHighlights) tappedHyperlinkIds.push(highlightInfo.highlightId);
    const sortedTappedHighlights = this.getHighlightInfo(tappedHyperlinkIds);
    
    return {
      'tapRange': tapRange,
      'highlights': sortedTappedHighlights,
      'hyperlinks': tappedHyperlinks,
    };
  }
  
  // Compare new highlight information to old highlight information, returning an object with the properties that changed
  function diffHighlight(newHighlightInfo, oldHighlightInfo) {
    if (!oldHighlightInfo) return newHighlightInfo;
    const changedHighlightInfo = {}
    for (const key of Object.keys(newHighlightInfo)) {
      if (oldHighlightInfo.hasOwnProperty(key) && oldHighlightInfo[key] != newHighlightInfo[key]) {
        changedHighlightInfo[key] = newHighlightInfo[key];
      }
    }
    return changedHighlightInfo;
  }
  
  // Undraw the specified highlight
  const undrawHighlight = (highlightInfo) => {
    const highlightId = highlightInfo.highlightId;
    for (const svgGroup of svgBackground.querySelectorAll(`g[data-highlight-id="${highlightId}"]`)) svgGroup.remove();
    document.querySelectorAll(`.hh-wrapper-start[data-highlight-id="${highlightId}"], .hh-wrapper-end[data-highlight-id="${highlightId}"]`).forEach(el => el.remove());
    document.querySelectorAll(`.hh-read-only[data-highlight-id="${highlightId}"]`).forEach(span => {
      const parentParagraph = span.closest(options.paragraphSelector);
      const textNode = span.firstChild;
      span.outerHTML = span.innerHTML;
      parentParagraph.normalize();
    });
    if (highlightsById.hasOwnProperty(highlightId)) highlightInfo.highlightRange = getRestoredHighlightRange(highlightInfo);
    const highlightCssRules = highlightsStylesheet.cssRules;
    const ruleIndexesToDelete = [];
    for (let r = 0; r < highlightCssRules.length; r++) {
      if (highlightCssRules[r].selectorText.includes(`::highlight(${highlightInfo.escapedHighlightId})`) || highlightCssRules[r].selectorText.includes(`[data-highlight-id="${highlightId}"]`)) ruleIndexesToDelete.push(r);
    }
    for (const index of ruleIndexesToDelete.reverse()) highlightsStylesheet.deleteRule(index);
    if (CSS.highlights && CSS.highlights.has(highlightId)) CSS.highlights.delete(highlightId);
  }
  
  // Update the text selection color (to match the highlight color, when a highlight is selected for editing; or, to reset to the default text selection color)
  const updateSelectionStyle = (color, style) => {
    if (color && style) {
      let styleTemplate = getStyleTemplate(color, style, 'css');
      selectionStylesheet.replaceSync(`::selection { ${styleTemplate} }`);
    } else {
      selectionStylesheet.replaceSync(`::selection { background-color: Highlight; color: HighlightText; }`);
    }
    annotatableContainer.dispatchEvent(new CustomEvent('hh:selectionupdate', { detail: {
      color: color,
      style: style,
    }}));
  }
  
  // Snap the selection or highlight range to the nearest word
  function snapRangeToWord(range) {
    let startNode = range.startContainer;
    let endNode = range.endContainer;
    let startOffset = range.startOffset;
    let endOffset = range.endOffset;
    
    // Trim whitespace at range start and end
    while (/\s/.test(startOffset < startNode.wholeText.length && startNode.wholeText[startOffset])) startOffset += 1;
    while (endOffset - 1 >= 0 && /\s/.test(endNode.wholeText[endOffset - 1])) endOffset -= 1;
    
    // If the range starts at the end of a text node, move it to start at the beginning of the following text node. This prevents the range from jumping across the text node boundary and selecting an extra word.
    if (startOffset == startNode.wholeText.length) {
      let parentElement = range.commonAncestorContainer;
      let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while (!textNode || textNode !== startNode) textNode = walker.nextNode();
      textNode = walker.nextNode();
      startNode = textNode;
      startOffset = 1;
    }
    
    // Expand range to word boundaries
    while (startOffset > 0 && /\S/.test(startNode.wholeText[startOffset - 1])) startOffset -= 1;
    while (endOffset + 1 <= endNode.wholeText.length && /\S/.test(endNode.wholeText[endOffset])) endOffset += 1;
    
    let newRange = document.createRange();
    newRange.setStart(startNode, startOffset);
    newRange.setEnd(endNode, endOffset);
    return newRange;
  }
  
  // Get the character offset relative to the annotatable paragraph
  // Adapted from https://stackoverflow.com/a/48812529/1349044
  const getParagraphOffset = (currentNode, currentOffset, annotatableParagraph = null) => {
    if (!currentNode.parentElement) return [ null, currentOffset ]
    if (!annotatableParagraph) annotatableParagraph = currentNode.parentElement.closest(options.paragraphSelector);
    if (currentNode === annotatableParagraph) return [ annotatableParagraph.id, currentOffset ];
    let prevSibling;
    while (prevSibling = (prevSibling || currentNode).previousSibling) {
      let nodeContent = prevSibling.innerText || prevSibling.nodeValue || '';
      currentOffset += nodeContent.length;
    }
    return getParagraphOffset(currentNode.parentElement, currentOffset, annotatableParagraph);
  }
  
  // Get the character offset relative to the deepest relevant text node
  const getTextNodeOffset = (parentElement, targetOffset) => {
    let walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT);
    let textNode = null;
    let currentOffset = 0;
    while(!textNode || currentOffset < targetOffset) {
      textNode = walker.nextNode();
      currentOffset += textNode.wholeText.length;
    }
    let relativeOffset = textNode.wholeText.length - currentOffset + targetOffset;
    return [ textNode, relativeOffset ];
  }
  
  // Get style template for a given highlight style
  const getStyleTemplate = (color, style, type) => {
    color = color in options.colors ? color : options.defaultColor;
    style = style in options.styles ? style : options.defaultStyle;
    let cssColorString = options.colors[color];
    let cssStyleString = options.styles[style][type].replaceAll('{color}', cssColorString);
    return cssStyleString;
  }      
  
  // Restore the previous selection range in case the browser clears the selection
  const getRestoredSelectionOrCaret = (selection, pointerEvent = null) => {
    if (selection.type == 'None') {
      if (previousSelectionRange) {
        // iOS Safari deselects text when a button is tapped. This restores the selection.
        selection.addRange(previousSelectionRange);
      } else if (pointerEvent) {
        // In most browsers, tapping or clicking somewhere on the page creates a selection of 0 character length (selection.type == "Caret"). iOS Safari instead clears the selection (selection.type == "None"). This restores a Caret selection if the selection type is None.
        let range = getRangeFromTapEvent(pointerEvent);
        selection.addRange(range);
      }
    }
    return selection;
  }
  
  // Fix highlight range if the DOM changed and made the previous highlight range invalid
  const getRestoredHighlightRange = (highlightInfo) => {
    const highlightRange = highlightInfo.highlightRange;
    if (highlightRange.startContainer.nodeType != Node.TEXT_NODE || highlightRange.endContainer.nodeType != Node.TEXT_NODE) {
      ([ startNode, startOffset ] = getTextNodeOffset(document.getElementById(highlightInfo.startParagraphId), highlightInfo.startParagraphOffset));
      ([ endNode, endOffset ] = getTextNodeOffset(document.getElementById(highlightInfo.endParagraphId), highlightInfo.endParagraphOffset));
      highlightRange.setStart(startNode, startOffset);
      highlightRange.setEnd(endNode, endOffset);
    }
    return highlightRange;
  }
  
  // Convert tap or click to a selection range
  // Adapted from https://stackoverflow.com/a/12924488/1349044
  function getRangeFromTapEvent(event) {
    let range;
    if (document.caretPositionFromPoint) {
      // Most browsers
      let caretPosition = document.caretPositionFromPoint(event.clientX, event.clientY);
      range = document.createRange();
      range.setStart(caretPosition.offsetNode, caretPosition.offset);
      range.collapse(true);
    } else if (document.caretRangeFromPoint) {
      // Safari
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    }
    return range;
  }
  
  // Merge adjacent DOMRects
  const getMergedDomRects = (rects, lineRoundN = 10) => {
    // Group rects into lines by rounding the Y position up or down (for elements like drop caps, subscripts, and superscripts that may not otherwise line up)
    const linesByRoundedYPos = {};
    for (const rect of rects) {
      const yPos = rect.y;
      const roundedYPos = Math.round(yPos / lineRoundN) * lineRoundN;
      if (!linesByRoundedYPos.hasOwnProperty(roundedYPos)) {
        linesByRoundedYPos[roundedYPos] = { rects: [], combinedWidthByYPos: {}, }
      }
      linesByRoundedYPos[roundedYPos].rects.push(rect);
      if (!linesByRoundedYPos[roundedYPos].combinedWidthByYPos.hasOwnProperty(yPos)) {
        linesByRoundedYPos[roundedYPos].combinedWidthByYPos[yPos] = 0;
      }
      linesByRoundedYPos[roundedYPos].combinedWidthByYPos[yPos] += rect.width;
    }
    // Merge the rects (one rect for each line)
    const mergedRects = [];
    for (const lineInfo of Object.values(linesByRoundedYPos)) {
      const sortedCombinedWidthByYPos = Object.entries(lineInfo.combinedWidthByYPos).sort((a, b) => b[1] - a[1]);
      const dominantYPos = sortedCombinedWidthByYPos[0]?.[0];
      const mergedRect = lineInfo.rects[0];
      for (const rect of lineInfo.rects) {
        mergedRect.x = Math.min(mergedRect.x, rect.x);
        mergedRect.width = Math.max(mergedRect.right, rect.right) - mergedRect.x;
        mergedRect.y = dominantYPos;
        mergedRect.height = Math.max(mergedRect.bottom, rect.bottom) - mergedRect.y;
      }
      mergedRects.push(mergedRect);
    }
    return mergedRects;
  }
  
  // Debounce a function to prevent it from being executed too frequently
  // Adapted from https://levelup.gitconnected.com/debounce-in-javascript-improve-your-applications-performance-5b01855e086
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
}


// -------- DEFAULTS --------

// Default function for generating a highlight ID
const hhGetNewHighlightId = () => {
  return 'hh-' + Date.now().toString();
}

// Default options
let hhDefaultOptions = {
  containerSelector: 'body',
  paragraphSelector: 'h1, h2, h3, h4, h5, h6, p, ol, ul, dl, tr',
  colors: {
    'red': 'hsl(352, 99%, 65%)',
    'orange': 'hsl(31, 99%, 58%)',
    'yellow': 'hsl(50, 98%, 61%)',
    'green': 'hsl(75, 70%, 49%)',
    'blue': 'hsl(182, 86%, 47%)',
  },
  styles: {
    'fill': {
      'css': 'background-color: hsl(from {color} h s l / 40%);',
      'svg': '<rect fill="hsl(from {color} h s l / 40%)" x="{x}" y="{y}" height="{height}" rx="4" style="width: calc({width}px + ({height}px / 5)); transform: translateX(calc({height}px / -10));" />',
    },
    'single-underline': {
      'css': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-thickness: 0.15em; text-underline-offset: 0.15em; text-decoration-skip-ink: none;',
      'svg': '<rect fill="{color}" x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 6); transform: translateY(calc({height}px * 0.9));" />',
    },
    'double-underline': {
      'css': 'text-decoration: underline; text-decoration-color: {color}; text-decoration-style: double; text-decoration-skip-ink: none;',
      'svg': '<rect fill="{color}" x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 0.9));" /><rect fill="{color}" x="{x}" y="{y}" style="width: {width}px; height: calc({height}px / 12); transform: translateY(calc({height}px * 1.05));" />',
    },
    'colored-text': {
      'css': 'color: {color};',
      'svg': '',
    },
    'redacted': {
      'css': 'background-color: transparent; color: transparent;',
      'svg': '',
    },
  },
  wrappers: {
    'none': {},
    'sliders': { start: '<span class="slider-start" data-accessibility-label="{startAccessibilityLabel}" style="--color: {color}"></span>', end: '<span class="slider-end" data-accessibility-label="{endAccessibilityLabel}" style="--color: {color}"></span>', },
    'footnote': { start: '<span class="footnote-marker" data-marker="{marker}" data-accessibility-label="{accessibilityLabel}" style="--color: {color}"></span>', end: '', },
  },
  rememberStyle: true,
  snapToWord: false,
  pointerMode: 'default',
  drawingMode: CSS.highlights ? 'highlight-api' : 'svg',
  defaultColor: 'yellow',
  defaultStyle: 'fill',
  defaultWrapper: 'none',
  highlightIdFunction: hhGetNewHighlightId,
}

console.log('Highlighter loaded');
