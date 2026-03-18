<template>
  <div class="h-full flex flex-col overflow-hidden">
    <Teleport v-if="toolbarTargetSelector" :to="toolbarTargetSelector">
      <div
        ref="toolbarShellRef"
        class="pdf-toolbar-wrap pdf-toolbar-wrap-embedded"
        @mousedown="markPaneActive"
      >
        <div class="pdf-toolbar">
          <div class="pdf-toolbar-left">
            <div class="pdf-toolbar-group">
              <button
                type="button"
                class="pdf-toolbar-btn"
                :class="{ 'pdf-toolbar-btn-active': pdfUi.sidebarOpen }"
                :title="pdfUi.sidebarOpen ? t('Hide sidebar') : t('Show sidebar')"
                :disabled="!pdfUi.ready"
                @click="toggleSidebar"
              >
                <component :is="sidebarIcon" :size="13" :stroke-width="1.8" />
              </button>
              <div class="pdf-toolbar-separator"></div>
              <button
                type="button"
                class="pdf-toolbar-btn"
                :class="{ 'pdf-toolbar-btn-active': searchOpen }"
                :title="t('Search')"
                :disabled="!pdfUi.ready"
                @click="toggleSearch"
              >
                <IconSearch :size="13" :stroke-width="1.8" />
              </button>
              <div class="pdf-toolbar-separator"></div>
              <button
                type="button"
                class="pdf-toolbar-btn"
                :class="{ 'pdf-toolbar-btn-active': pdfTranslationBusy }"
                :title="pdfTranslationBusy ? t('Translating...') : t('Translate this PDF')"
                :disabled="!pdfUi.ready"
                @click="translateCurrentPdf"
                @contextmenu.prevent.stop="openPdfTranslationMenu"
              >
                <IconLanguage :size="13" :stroke-width="1.8" />
              </button>
              <div class="pdf-toolbar-separator"></div>
              <button
                type="button"
                class="pdf-toolbar-btn"
                :title="t('Previous page')"
                :disabled="!pdfUi.canGoPrevious"
                @click="goToPreviousPage"
              >
                <IconChevronLeft :size="13" :stroke-width="1.8" />
              </button>
              <button
                type="button"
                class="pdf-toolbar-btn"
                :title="t('Next page')"
                :disabled="!pdfUi.canGoNext"
                @click="goToNextPage"
              >
                <IconChevronRight :size="13" :stroke-width="1.8" />
              </button>
              <div class="pdf-toolbar-separator"></div>
              <div class="pdf-toolbar-group pdf-page-indicator">
                <input
                  ref="pageInputRef"
                  v-model="pageInputValue"
                  type="text"
                  inputmode="numeric"
                  class="pdf-toolbar-input pdf-page-input"
                  :disabled="!pdfUi.ready"
                  @focus="markPaneActive"
                  @keydown.enter.prevent="submitPageNumber"
                  @blur="submitPageNumber"
                />
                <span class="pdf-toolbar-label">{{ t('of {count}', { count: pdfUi.pagesCount || 0 }) }}</span>
              </div>
            </div>
          </div>

          <div class="pdf-toolbar-center">
            <div class="pdf-toolbar-group">
              <button
                type="button"
                class="pdf-toolbar-btn"
                :title="t('Zoom out')"
                :disabled="!pdfUi.canZoomOut"
                @click="zoomOut"
              >
                <IconMinus :size="13" :stroke-width="1.8" />
              </button>
              <button
                type="button"
                class="pdf-toolbar-btn"
                :title="t('Zoom in')"
                :disabled="!pdfUi.canZoomIn"
                @click="zoomIn"
              >
                <IconPlus :size="13" :stroke-width="1.8" />
              </button>
            </div>

            <div class="pdf-toolbar-group pdf-toolbar-group-scale">
              <select
                class="pdf-toolbar-select"
                :value="pdfUi.scaleValue"
                :disabled="!pdfUi.ready || scaleOptions.length === 0"
                @focus="markPaneActive"
                @change="handleScaleSelectChange"
              >
                <option
                  v-for="option in scaleOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="pdf-toolbar-right">
            <div class="pdf-toolbar-group">
              <div
                v-if="hasEditorTools"
                class="pdf-toolbar-group pdf-toolbar-group-collapsible"
                :class="{ 'pdf-toolbar-group-collapsible-open': editorToolsExpanded }"
              >
                <div class="pdf-toolbar-collapsible-tools">
                  <button
                    v-if="toolbarButtons.editorFreeTextButton.visible"
                    type="button"
                    class="pdf-toolbar-btn"
                    :class="{ 'pdf-toolbar-btn-active': toolbarButtons.editorFreeTextButton.active || activeToolbarPanel === 'freetext' }"
                    :title="t('Text')"
                    :disabled="toolbarButtons.editorFreeTextButton.disabled"
                    @click="activateEditorTool('editorFreeTextButton', 'freetext')"
                  >
                    <IconLetterT :size="13" :stroke-width="1.8" />
                  </button>
                  <button
                    v-if="toolbarButtons.editorInkButton.visible"
                    type="button"
                    class="pdf-toolbar-btn"
                    :class="{ 'pdf-toolbar-btn-active': toolbarButtons.editorInkButton.active || activeToolbarPanel === 'ink' }"
                    :title="t('Ink')"
                    :disabled="toolbarButtons.editorInkButton.disabled"
                    @click="activateEditorTool('editorInkButton', 'ink')"
                  >
                    <IconPencil :size="13" :stroke-width="1.8" />
                  </button>
                  <button
                    v-if="toolbarButtons.editorStampButton.visible"
                    type="button"
                    class="pdf-toolbar-btn"
                    :class="{ 'pdf-toolbar-btn-active': toolbarButtons.editorStampButton.active || activeToolbarPanel === 'stamp' }"
                    :title="t('Stamp')"
                    :disabled="toolbarButtons.editorStampButton.disabled"
                    @click="activateEditorTool('editorStampButton', 'stamp')"
                  >
                    <IconPhoto :size="13" :stroke-width="1.8" />
                  </button>
                </div>
                <button
                  type="button"
                  class="pdf-toolbar-btn"
                  :class="{ 'pdf-toolbar-btn-active': editorToolGroupActive }"
                  :title="editorToolsToggleTitle"
                  @click="toggleEditorToolsExpanded"
                >
                  <IconChevronRight v-if="editorToolsExpanded" :size="13" :stroke-width="1.8" />
                  <IconChevronLeft v-else :size="13" :stroke-width="1.8" />
                </button>
              </div>
              <div
                v-if="hasEditorTools"
                class="pdf-toolbar-separator"
              ></div>
              <button
                v-if="toolbarButtons.secondaryToolbarToggleButton.visible"
                type="button"
                class="pdf-toolbar-btn"
                :class="{ 'pdf-toolbar-btn-active': activeToolbarPanel === 'tools' }"
                :title="t('Tools')"
                :disabled="toolbarButtons.secondaryToolbarToggleButton.disabled"
                @click="toggleToolsMenu"
              >
                <IconTool :size="13" :stroke-width="1.8" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="searchOpen" class="pdf-search-popover">
          <div class="pdf-search-popover-row pdf-search-popover-row-main">
            <button
              type="button"
              class="pdf-toolbar-btn pdf-toolbar-btn-sm"
              :disabled="!searchDraft.trim()"
              :title="t('Previous match')"
              @click="runSearch(true)"
            >
              <IconChevronUp :size="12" :stroke-width="1.8" />
            </button>
            <input
              ref="searchInputRef"
              v-model="searchDraft"
              type="text"
              class="pdf-toolbar-input pdf-toolbar-search"
              :placeholder="t('Search in PDF')"
              @focus="markPaneActive"
              @keydown.enter.prevent="runSearch(false)"
            />
            <button
              type="button"
              class="pdf-toolbar-btn pdf-toolbar-btn-sm"
              :disabled="!searchDraft.trim()"
              :title="t('Next match')"
              @click="runSearch(false)"
            >
              <IconChevronDown :size="12" :stroke-width="1.8" />
            </button>
          </div>
          <div class="pdf-search-popover-row pdf-search-popover-row-options">
            <button
              type="button"
              class="pdf-search-toggle"
              :class="{ 'pdf-search-toggle-active': pdfUi.searchHighlightAll }"
              @click="toggleSearchOption('searchHighlightAll')"
            >
              {{ t('Highlight all') }}
            </button>
            <button
              type="button"
              class="pdf-search-toggle"
              :class="{ 'pdf-search-toggle-active': pdfUi.searchCaseSensitive }"
              @click="toggleSearchOption('searchCaseSensitive')"
            >
              {{ t('Match case') }}
            </button>
            <button
              type="button"
              class="pdf-search-toggle"
              :class="{ 'pdf-search-toggle-active': pdfUi.searchMatchDiacritics }"
              @click="toggleSearchOption('searchMatchDiacritics')"
            >
              {{ t('Match diacritics') }}
            </button>
            <button
              type="button"
              class="pdf-search-toggle"
              :class="{ 'pdf-search-toggle-active': pdfUi.searchEntireWord }"
              @click="toggleSearchOption('searchEntireWord')"
            >
              {{ t('Whole words') }}
            </button>
            <span v-if="pdfUi.searchResultText" class="pdf-toolbar-hint pdf-search-result-hint">{{ pdfUi.searchResultText }}</span>
          </div>
        </div>

        <div v-if="activeToolbarPanel === 'freetext'" class="pdf-toolbar-popover pdf-toolbar-popover-right">
          <div class="pdf-toolbar-popover-title">{{ t('Text') }}</div>
          <label class="pdf-toolbar-field">
            <span class="pdf-toolbar-hint">{{ t('Color') }}</span>
            <input
              type="color"
              class="pdf-color-input"
              :value="editorParams.freeTextColor"
              @input="setPdfInputValue('editorFreeTextColor', $event.target.value)"
            >
          </label>
          <label class="pdf-toolbar-field">
            <span class="pdf-toolbar-hint">{{ t('Font size') }}</span>
            <input
              type="range"
              min="5"
              max="100"
              step="1"
              :value="editorParams.freeTextFontSize"
              @input="setPdfInputValue('editorFreeTextFontSize', $event.target.value)"
            >
          </label>
        </div>

        <div v-if="activeToolbarPanel === 'ink'" class="pdf-toolbar-popover pdf-toolbar-popover-right">
          <div class="pdf-toolbar-popover-title">{{ t('Ink') }}</div>
          <label class="pdf-toolbar-field">
            <span class="pdf-toolbar-hint">{{ t('Color') }}</span>
            <input
              type="color"
              class="pdf-color-input"
              :value="editorParams.inkColor"
              @input="setPdfInputValue('editorInkColor', $event.target.value)"
            >
          </label>
          <label class="pdf-toolbar-field">
            <span class="pdf-toolbar-hint">{{ t('Thickness') }}</span>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              :value="editorParams.inkThickness"
              @input="setPdfInputValue('editorInkThickness', $event.target.value)"
            >
          </label>
          <label class="pdf-toolbar-field">
            <span class="pdf-toolbar-hint">{{ t('Opacity') }}</span>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              :value="editorParams.inkOpacity"
              @input="setPdfInputValue('editorInkOpacity', $event.target.value)"
            >
          </label>
        </div>

        <div v-if="activeToolbarPanel === 'stamp'" class="pdf-toolbar-popover pdf-toolbar-popover-right">
          <div class="pdf-toolbar-popover-title">{{ t('Stamp') }}</div>
          <button
            type="button"
            class="pdf-toolbar-menu-item"
            @click="runToolMenuCommand('editorStampAddImage')"
          >
            {{ editorParams.stampAddLabel || t('Add image') }}
          </button>
        </div>

        <div v-if="activeToolbarPanel === 'tools'" class="pdf-toolbar-popover pdf-toolbar-popover-menu">
          <button v-if="toolMenuItems.secondaryOpenFile.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.secondaryOpenFile.disabled" @click="runToolMenuCommand('secondaryOpenFile')">{{ toolMenuItems.secondaryOpenFile.label }}</button>
          <button v-if="toolMenuItems.secondaryPrint.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.secondaryPrint.disabled" @click="runToolMenuCommand('secondaryPrint')">{{ toolMenuItems.secondaryPrint.label }}</button>
          <button v-if="toolMenuItems.secondaryDownload.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.secondaryDownload.disabled" @click="runToolMenuCommand('secondaryDownload')">{{ toolMenuItems.secondaryDownload.label }}</button>
          <div v-if="toolMenuItems.secondaryOpenFile.visible || toolMenuItems.secondaryPrint.visible || toolMenuItems.secondaryDownload.visible" class="pdf-toolbar-menu-separator"></div>

          <button v-if="toolMenuItems.presentationMode.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.presentationMode.disabled" @click="runToolMenuCommand('presentationMode')">{{ toolMenuItems.presentationMode.label }}</button>
          <button v-if="toolMenuItems.viewBookmark.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.viewBookmark.disabled" @click="runToolMenuCommand('viewBookmark')">{{ toolMenuItems.viewBookmark.label }}</button>
          <div v-if="toolMenuItems.presentationMode.visible || toolMenuItems.viewBookmark.visible" class="pdf-toolbar-menu-separator"></div>

          <button v-if="toolMenuItems.firstPage.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.firstPage.disabled" @click="runToolMenuCommand('firstPage')">{{ toolMenuItems.firstPage.label }}</button>
          <button v-if="toolMenuItems.lastPage.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.lastPage.disabled" @click="runToolMenuCommand('lastPage')">{{ toolMenuItems.lastPage.label }}</button>
          <div v-if="toolMenuItems.firstPage.visible || toolMenuItems.lastPage.visible" class="pdf-toolbar-menu-separator"></div>

          <button v-if="toolMenuItems.pageRotateCw.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.pageRotateCw.disabled" @click="runToolMenuCommand('pageRotateCw')">{{ toolMenuItems.pageRotateCw.label }}</button>
          <button v-if="toolMenuItems.pageRotateCcw.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.pageRotateCcw.disabled" @click="runToolMenuCommand('pageRotateCcw')">{{ toolMenuItems.pageRotateCcw.label }}</button>
          <div v-if="toolMenuItems.pageRotateCw.visible || toolMenuItems.pageRotateCcw.visible" class="pdf-toolbar-menu-separator"></div>

          <button v-if="toolMenuItems.cursorSelectTool.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.cursorSelectTool.active }" :disabled="toolMenuItems.cursorSelectTool.disabled" @click="runToolMenuCommand('cursorSelectTool')">{{ toolMenuItems.cursorSelectTool.label }}</button>
          <button v-if="toolMenuItems.cursorHandTool.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.cursorHandTool.active }" :disabled="toolMenuItems.cursorHandTool.disabled" @click="runToolMenuCommand('cursorHandTool')">{{ toolMenuItems.cursorHandTool.label }}</button>
          <div v-if="toolMenuItems.cursorSelectTool.visible || toolMenuItems.cursorHandTool.visible" class="pdf-toolbar-menu-separator"></div>

          <button v-if="toolMenuItems.scrollPage.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.scrollPage.active }" :disabled="toolMenuItems.scrollPage.disabled" @click="runToolMenuCommand('scrollPage')">{{ toolMenuItems.scrollPage.label }}</button>
          <button v-if="toolMenuItems.scrollVertical.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.scrollVertical.active }" :disabled="toolMenuItems.scrollVertical.disabled" @click="runToolMenuCommand('scrollVertical')">{{ toolMenuItems.scrollVertical.label }}</button>
          <button v-if="toolMenuItems.scrollHorizontal.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.scrollHorizontal.active }" :disabled="toolMenuItems.scrollHorizontal.disabled" @click="runToolMenuCommand('scrollHorizontal')">{{ toolMenuItems.scrollHorizontal.label }}</button>
          <button v-if="toolMenuItems.scrollWrapped.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.scrollWrapped.active }" :disabled="toolMenuItems.scrollWrapped.disabled" @click="runToolMenuCommand('scrollWrapped')">{{ toolMenuItems.scrollWrapped.label }}</button>
          <div v-if="toolMenuItems.scrollPage.visible || toolMenuItems.scrollVertical.visible || toolMenuItems.scrollHorizontal.visible || toolMenuItems.scrollWrapped.visible" class="pdf-toolbar-menu-separator"></div>

          <button v-if="toolMenuItems.spreadNone.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.spreadNone.active }" :disabled="toolMenuItems.spreadNone.disabled" @click="runToolMenuCommand('spreadNone')">{{ toolMenuItems.spreadNone.label }}</button>
          <button v-if="toolMenuItems.spreadOdd.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.spreadOdd.active }" :disabled="toolMenuItems.spreadOdd.disabled" @click="runToolMenuCommand('spreadOdd')">{{ toolMenuItems.spreadOdd.label }}</button>
          <button v-if="toolMenuItems.spreadEven.visible" type="button" class="pdf-toolbar-menu-item" :class="{ 'pdf-toolbar-menu-item-active': toolMenuItems.spreadEven.active }" :disabled="toolMenuItems.spreadEven.disabled" @click="runToolMenuCommand('spreadEven')">{{ toolMenuItems.spreadEven.label }}</button>
          <div v-if="toolMenuItems.spreadNone.visible || toolMenuItems.spreadOdd.visible || toolMenuItems.spreadEven.visible" class="pdf-toolbar-menu-separator"></div>

          <button v-if="toolMenuItems.documentProperties.visible" type="button" class="pdf-toolbar-menu-item" :disabled="toolMenuItems.documentProperties.disabled" @click="runToolMenuCommand('documentProperties')">{{ toolMenuItems.documentProperties.label }}</button>
        </div>
      </div>
    </Teleport>

    <div class="relative flex-1 overflow-hidden">
      <Teleport v-if="annotationsSidebarTarget" :to="annotationsSidebarTarget">
        <section class="pdf-annotation-sidebar-shell" @mousedown="markPaneActive">
          <div class="pdf-annotation-list">
            <div v-if="pendingSelection" class="pdf-annotation-pending">
              <div class="pdf-annotation-pending-label">{{ t('Selection ready') }}</div>
              <div class="pdf-annotation-pending-quote">{{ pendingSelection.quote }}</div>
              <button
                type="button"
                class="pdf-annotation-primary"
                @mousedown.prevent
                @click="createAnnotationFromSelection"
              >
                {{ t('Create highlight on page {page}', { page: pendingSelection.page }) }}
              </button>
            </div>

            <div
              v-if="currentPdfAnnotations.length === 0"
              class="pdf-annotation-empty"
            >
              <div>{{ t('No highlights yet') }}</div>
              <div class="pdf-annotation-empty-hint">
                {{ t('Select text in the PDF, then save it as a highlight.') }}
              </div>
            </div>

            <div
              v-for="annotation in currentPdfAnnotations"
              v-else
              :key="annotation.id"
              class="pdf-annotation-item"
              tabindex="0"
              :class="{ 'pdf-annotation-item-active': annotation.id === activeAnnotationId }"
              @click="focusAnnotation(annotation)"
              @keydown.enter.prevent="focusAnnotation(annotation)"
            >
              <div class="pdf-annotation-item-header">
                <span class="pdf-annotation-page">{{ t('Page {page}', { page: annotation.page }) }}</span>
                <span class="pdf-annotation-date">{{ formatAnnotationTimestamp(annotation.updatedAt || annotation.createdAt) }}</span>
              </div>
              <div class="pdf-annotation-quote">{{ annotation.quote }}</div>
              <div class="pdf-annotation-actions">
                <span class="pdf-annotation-open">{{ t('Jump to quote') }}</span>
                <button
                  type="button"
                  class="pdf-annotation-delete"
                  :title="t('Delete highlight')"
                  @click.stop="deleteAnnotation(annotation)"
                >
                  {{ t('Delete') }}
                </button>
              </div>
              <div class="pdf-annotation-note-shell" @click.stop>
                <button
                  v-if="!noteForAnnotation(annotation.id)"
                  type="button"
                  class="pdf-annotation-note-create"
                  @click="createNoteFromAnnotation(annotation)"
                >
                  {{ t('Create note') }}
                </button>
                <ResearchNoteCard
                  v-else
                  :note="noteForAnnotation(annotation.id)"
                  :annotation="annotation"
                  :is-active="noteForAnnotation(annotation.id)?.id === activeNoteId"
                  @update-comment="updateNoteComment(noteForAnnotation(annotation.id), $event)"
                  @insert="insertNoteIntoManuscript(annotation)"
                  @delete="deleteNote(noteForAnnotation(annotation.id))"
                />
              </div>
            </div>
          </div>
        </section>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="pdfTranslationMenu.show"
          class="fixed inset-0 z-[999]"
          @click="closePdfTranslationMenu"
          @contextmenu.prevent="closePdfTranslationMenu"
        ></div>
        <div
          v-if="pdfTranslationMenu.show"
          class="context-menu py-1 ui-text-md pdf-context-menu pdf-translate-context-menu"
          :style="pdfTranslationMenuStyle"
          @mousedown.prevent
        >
          <div class="pdf-translate-menu-block">
            <div class="pdf-translate-menu-label">{{ translationMenuStatusLabel }}</div>
            <div v-if="translationMenuStatusDetail" class="pdf-translate-menu-detail">{{ translationMenuStatusDetail }}</div>
          </div>
          <div v-if="canCancelPdfTranslation" class="context-menu-separator"></div>
          <button
            v-if="canCancelPdfTranslation"
            type="button"
            class="context-menu-item pdf-context-menu-item"
            @click="cancelCurrentPdfTranslation"
          >
            {{ t('Cancel translation') }}
          </button>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="pdfContextMenu.show"
          class="fixed inset-0 z-[999]"
          @click="closePdfContextMenu"
          @contextmenu.prevent="closePdfContextMenu"
        ></div>
        <div
          v-if="pdfContextMenu.show"
          class="context-menu py-1 ui-text-md pdf-context-menu"
          :style="pdfContextMenuStyle"
          @mousedown.prevent
        >
          <button
            v-if="pdfContextMenu.hasPendingSelection"
            type="button"
            class="context-menu-item pdf-context-menu-item"
            @click="createAnnotationFromContextMenu"
          >
            {{ t('Add highlight') }}
          </button>
          <button
            v-if="pdfContextMenu.selectedText"
            type="button"
            class="context-menu-item pdf-context-menu-item"
            @click="copyPdfSelection"
          >
            {{ t('Copy') }}
          </button>
          <button
            v-if="pdfContextMenu.hasPendingSelection"
            type="button"
            class="context-menu-item pdf-context-menu-item"
            @click="searchSelectedTextInPdf"
          >
            {{ t('Search selected text in PDF') }}
          </button>
          <div
            v-if="pdfContextMenu.hasPendingSelection || pdfContextMenu.selectedText"
            class="context-menu-separator"
          ></div>

          <button
            type="button"
            class="context-menu-item pdf-context-menu-item"
            @click="openAnnotationsPanelFromMenu"
          >
            {{ t('Highlights') }}
          </button>
          <button
            type="button"
            class="context-menu-item pdf-context-menu-item"
            @click="openSearchFromContextMenu"
          >
            {{ t('Search in PDF') }}
          </button>
          <button
            type="button"
            class="context-menu-item pdf-context-menu-item"
            @click="toggleSidebarFromContextMenu"
          >
            {{ pdfUi.sidebarOpen ? t('Hide sidebar') : t('Show sidebar') }}
          </button>
          <div class="context-menu-separator"></div>

          <button
            type="button"
            class="context-menu-item pdf-context-menu-item"
            :disabled="!pdfUi.canGoPrevious"
            @click="runPdfContextCommand(goToPreviousPage)"
          >
            {{ t('Previous page') }}
          </button>
          <button
            type="button"
            class="context-menu-item pdf-context-menu-item"
            :disabled="!pdfUi.canGoNext"
            @click="runPdfContextCommand(goToNextPage)"
          >
            {{ t('Next page') }}
          </button>
          <div class="context-menu-separator"></div>

          <button
            type="button"
            class="context-menu-item pdf-context-menu-item"
            :disabled="!pdfUi.canZoomOut"
            @click="runPdfContextCommand(zoomOut)"
          >
            {{ t('Zoom out') }}
          </button>
          <button
            type="button"
            class="context-menu-item pdf-context-menu-item"
            :disabled="!pdfUi.canZoomIn"
            @click="runPdfContextCommand(zoomIn)"
          >
            {{ t('Zoom in') }}
          </button>
        </div>
      </Teleport>

      <iframe
        v-if="viewerSrc"
        ref="iframeRef"
        :src="viewerSrc"
        class="w-full h-full border-0"
        tabindex="0"
        style="display: block;"
        @focus="markPaneActive"
        @load="onIframeLoad"
      />

      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center text-sm"
        style="color: var(--fg-muted); background: var(--bg-primary);"
      >
        {{ t('Loading PDF...') }}
      </div>
      <div
        v-else-if="error"
        class="absolute inset-0 flex items-center justify-center px-6 text-sm"
        style="color: var(--fg-muted); background: var(--bg-primary);"
      >
        <div class="max-w-xl text-center">
          <div>{{ t('Could not load PDF') }}</div>
          <div v-if="error" class="mt-2 text-xs" style="word-break: break-word;">{{ error }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, toRef, watch } from 'vue'
import {
  IconChevronLeft,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconLanguage,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLetterT,
  IconMinus,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconSearch,
  IconTool,
} from '@tabler/icons-vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '../../i18n'
import { useEditorStore } from '../../stores/editor'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { useResearchArtifactsStore } from '../../stores/researchArtifacts'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks'
import { createPdfQuoteAnchor } from '../../services/pdfAnchors'
import ResearchNoteCard from './ResearchNoteCard.vue'

const emit = defineEmits(['dblclick-page'])

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
  referenceKey: { type: String, default: '' },
})

const PDF_VIEWER_THEME_STYLE_ID = 'altals-pdf-viewer-theme'
const PDF_EMBEDDED_SIDEBAR_SHELL_ID = 'altalsViewsManagerShell'
const PDF_EMBEDDED_ANNOTATIONS_VIEW_ID = 'altalsAnnotationsView'
const EDITOR_TOOL_BUTTON_TO_PANEL = Object.freeze({
  editorFreeTextButton: 'freetext',
  editorInkButton: 'ink',
  editorStampButton: 'stamp',
})

const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const pdfTranslateStore = usePdfTranslateStore()
const researchArtifactsStore = useResearchArtifactsStore()
const editorStore = useEditorStore()
const { t, locale } = useI18n()
const filePathRef = toRef(props, 'filePath')

const iframeRef = ref(null)
const searchInputRef = ref(null)
const pageInputRef = ref(null)
const toolbarShellRef = ref(null)
const annotationsSidebarTarget = ref(null)
const viewerSrc = ref(null)
const loading = ref(true)
const error = ref(null)
const pendingSelection = ref(null)
const searchOpen = ref(false)
const searchDraft = ref('')
const pageInputValue = ref('1')
const scaleOptions = ref([])
const activeToolbarPanel = ref('')
const editorToolsExpanded = ref(false)
const pdfContextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  selectedText: '',
  hasPendingSelection: false,
})
const pdfTranslationMenu = reactive({
  show: false,
  x: 0,
  y: 0,
})

const pdfContextMenuStyle = computed(() => {
  const menuWidth = 220
  const itemCount = [
    pdfContextMenu.hasPendingSelection ? 1 : 0,
    pdfContextMenu.selectedText ? 1 : 0,
    pdfContextMenu.hasPendingSelection ? 1 : 0,
    1,
    1,
    1,
    1,
    1,
    1,
  ].reduce((sum, value) => sum + value, 0)
  const separatorCount = 3 + ((pdfContextMenu.hasPendingSelection || pdfContextMenu.selectedText) ? 1 : 0)
  const menuHeight = Math.min(360, 12 + itemCount * 30 + separatorCount * 9)
  const x = Math.min(pdfContextMenu.x, window.innerWidth - menuWidth - 8)
  const y = Math.min(pdfContextMenu.y, window.innerHeight - menuHeight - 8)
  return { left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` }
})
const pdfTranslationMenuStyle = computed(() => {
  const menuWidth = 240
  const menuHeight = canCancelPdfTranslation.value ? 92 : 68
  const x = Math.min(pdfTranslationMenu.x, window.innerWidth - menuWidth - 8)
  const y = Math.min(pdfTranslationMenu.y, window.innerHeight - menuHeight - 8)
  return { left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` }
})

const pdfUi = reactive({
  ready: false,
  pageNumber: 1,
  pagesCount: 0,
  canGoPrevious: false,
  canGoNext: false,
  canZoomOut: false,
  canZoomIn: false,
  scaleValue: 'auto',
  scaleLabel: t('Automatic Zoom'),
  sidebarOpen: false,
  searchOpen: false,
  searchQuery: '',
  searchResultText: '',
  searchHighlightAll: true,
  searchCaseSensitive: false,
  searchMatchDiacritics: false,
  searchEntireWord: false,
  sidebarView: 'thumbnails',
  sidebarCanFocusCurrentOutline: false,
})

const sidebarTabs = reactive({
  thumbnails: { disabled: false },
  outlines: { disabled: false },
  attachments: { disabled: false },
  annotations: { disabled: false },
  layers: { disabled: false },
})

const usingExternalToolbar = computed(() => !!props.toolbarTargetSelector)
const sidebarIcon = computed(() => (
  pdfUi.sidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand
))
const hasEditorTools = computed(() => (
  toolbarButtons.editorFreeTextButton.visible
  || toolbarButtons.editorInkButton.visible
  || toolbarButtons.editorStampButton.visible
))
const editorToolGroupActive = computed(() => (
  editorToolsExpanded.value
  || toolbarButtons.editorFreeTextButton.active
  || toolbarButtons.editorInkButton.active
  || toolbarButtons.editorStampButton.active
  || ['freetext', 'ink', 'stamp'].includes(activeToolbarPanel.value)
))
const editorToolsToggleTitle = computed(() => `${t('Text')} / ${t('Ink')} / ${t('Stamp')}`)
const toolbarButtons = reactive({
  editorFreeTextButton: createToolbarButtonState(),
  editorInkButton: createToolbarButtonState(),
  editorStampButton: createToolbarButtonState(),
  printButton: createToolbarButtonState(),
  downloadButton: createToolbarButtonState(),
  secondaryToolbarToggleButton: createToolbarButtonState(),
})
const toolMenuItems = reactive(createToolMenuState())
const editorParams = reactive({
  freeTextColor: '#000000',
  freeTextFontSize: 10,
  inkColor: '#000000',
  inkThickness: 1,
  inkOpacity: 1,
  stampAddLabel: '',
})

let syncTimer = null
let syncHighlightTimer = null
let activeSyncHighlightEl = null
let loadRequestId = 0
let iframeListenersAttached = false
let resolveViewerReady = null
let rejectViewerReady = null
let viewerReadyPromise = null
let annotationRenderScheduled = false
let annotationMutationObserver = null
let pendingScrollLocation = null
let sidebarStateObserver = null
let sidebarInitialViewResolved = false
let sidebarEverOpened = false
let sidebarViewOverride = ''

const LIGHT_THEMES = new Set(['light', 'one-light', 'humane', 'solarized'])
const isDark = computed(() => !LIGHT_THEMES.has(workspace.theme))
const currentPdfAnnotations = computed(() => (
  filePathRef.value ? researchArtifactsStore.annotationsForPdf(filePathRef.value) : []
))
const activeAnnotationId = computed(() => researchArtifactsStore.activeAnnotationId || null)
const activeNoteId = computed(() => researchArtifactsStore.activeNoteId || null)
const currentPdfTranslationTask = computed(() => (
  filePathRef.value ? pdfTranslateStore.latestTaskForInput(filePathRef.value) : null
))
const pdfTranslationBusy = computed(() => {
  const status = String(currentPdfTranslationTask.value?.status || '')
  return ['pending', 'queued', 'running'].includes(status)
    || pdfTranslateStore.setupInProgress
    || pdfTranslateStore.warmupInProgress
})
const canCancelPdfTranslation = computed(() => {
  const status = String(currentPdfTranslationTask.value?.status || '')
  return !!currentPdfTranslationTask.value?.id && ['pending', 'queued', 'running'].includes(status)
})
const translationMenuStatusLabel = computed(() => {
  const task = currentPdfTranslationTask.value
  const status = String(task?.status || '')
  if (['pending', 'queued', 'running'].includes(status)) {
    const progress = Number.isFinite(task?.progress) ? Math.round(task.progress) : 0
    return `${Math.max(0, progress)}%`
  }
  if (status === 'completed') return t('Translation completed')
  if (status === 'failed') return t('Failed')
  if (status === 'canceled') return t('Canceled')
  return t('No active translation')
})
const translationMenuStatusDetail = computed(() => {
  const status = String(currentPdfTranslationTask.value?.status || '')
  if (['pending', 'queued', 'running'].includes(status)) return ''
  return ''
})
function localizeScaleLabel(label) {
  const normalized = String(label || '').trim()
  if (!normalized) return normalized
  if (normalized === 'Automatic Zoom') return t('Automatic Zoom')
  if (normalized === 'Actual Size') return t('Actual Size')
  if (normalized === 'Page Fit') return t('Page Fit')
  if (normalized === 'Page Width') return t('Page Width')
  return normalized
}

function fileNameFromPath(path = '') {
  return String(path || '').split(/[\\/]/).pop() || path
}

function closePdfTranslationMenu() {
  pdfTranslationMenu.show = false
}

function getPdfViewerLocaleParam() {
  const normalized = String(locale.value || 'en-US').trim().toLowerCase()
  return normalized || 'en-us'
}

const PDF_TOOL_MENU_LABEL_KEYS = {
  secondaryOpenFile: 'Open',
  secondaryPrint: 'Print',
  secondaryDownload: 'Download',
  presentationMode: 'Presentation mode',
  viewBookmark: 'Bookmark',
  firstPage: 'Go to First Page',
  lastPage: 'Go to Last Page',
  pageRotateCw: 'Rotate Clockwise',
  pageRotateCcw: 'Rotate Counterclockwise',
  cursorSelectTool: 'Text Selection Tool',
  cursorHandTool: 'Hand Tool',
  scrollPage: 'Page Scrolling',
  scrollVertical: 'Vertical Scrolling',
  scrollHorizontal: 'Horizontal Scrolling',
  scrollWrapped: 'Wrapped Scrolling',
  spreadNone: 'No Spreads',
  spreadOdd: 'Odd Spreads',
  spreadEven: 'Even Spreads',
  documentProperties: 'Document Properties…',
}

const PDF_VIEWS_MANAGER_LABELS = {
  thumbnails: 'Thumbnails',
  outlines: 'Document outline',
  attachments: 'Attachments',
  layers: 'Layers',
}

const PDF_SIDEBAR_VIEW_BUTTON_IDS = {
  thumbnails: 'thumbnailsViewMenu',
  outlines: 'outlinesViewMenu',
  attachments: 'attachmentsViewMenu',
  layers: 'layersViewMenu',
}

const PDF_SIDEBAR_VIEW_CODE_TO_KEY = {
  1: 'thumbnails',
  2: 'outlines',
  3: 'attachments',
  4: 'layers',
}

function createToolbarButtonState() {
  return {
    visible: false,
    disabled: true,
    active: false,
    expanded: false,
  }
}

function createToolMenuState() {
  return {
    secondaryOpenFile: createLabeledMenuItemState(),
    secondaryPrint: createLabeledMenuItemState(),
    secondaryDownload: createLabeledMenuItemState(),
    presentationMode: createLabeledMenuItemState(),
    viewBookmark: createLabeledMenuItemState(),
    firstPage: createLabeledMenuItemState(),
    lastPage: createLabeledMenuItemState(),
    pageRotateCw: createLabeledMenuItemState(),
    pageRotateCcw: createLabeledMenuItemState(),
    cursorSelectTool: createLabeledMenuItemState(),
    cursorHandTool: createLabeledMenuItemState(),
    scrollPage: createLabeledMenuItemState(),
    scrollVertical: createLabeledMenuItemState(),
    scrollHorizontal: createLabeledMenuItemState(),
    scrollWrapped: createLabeledMenuItemState(),
    spreadNone: createLabeledMenuItemState(),
    spreadOdd: createLabeledMenuItemState(),
    spreadEven: createLabeledMenuItemState(),
    documentProperties: createLabeledMenuItemState(),
  }
}

function createLabeledMenuItemState() {
  return {
    visible: false,
    disabled: true,
    active: false,
    label: '',
  }
}

function resetPdfUi() {
  pdfUi.ready = false
  pdfUi.pageNumber = 1
  pdfUi.pagesCount = 0
  pdfUi.canGoPrevious = false
  pdfUi.canGoNext = false
  pdfUi.canZoomOut = false
  pdfUi.canZoomIn = false
  pdfUi.scaleValue = 'auto'
  pdfUi.scaleLabel = t('Automatic Zoom')
  pdfUi.sidebarOpen = false
  pdfUi.searchOpen = false
  pdfUi.searchQuery = ''
  pdfUi.searchResultText = ''
  pdfUi.searchHighlightAll = true
  pdfUi.searchCaseSensitive = false
  pdfUi.searchMatchDiacritics = false
  pdfUi.searchEntireWord = false
  pdfUi.sidebarView = 'thumbnails'
  pdfUi.sidebarCanFocusCurrentOutline = false
  sidebarInitialViewResolved = false
  sidebarEverOpened = false
  pageInputValue.value = '1'
  scaleOptions.value = []
  searchDraft.value = ''
  searchOpen.value = false
  activeToolbarPanel.value = ''
  closePdfContextMenu()
  closePdfTranslationMenu()
  annotationsSidebarTarget.value = null
  sidebarViewOverride = ''
  Object.keys(toolbarButtons).forEach((id) => {
    Object.assign(toolbarButtons[id], createToolbarButtonState())
  })
  Object.keys(toolMenuItems).forEach((id) => {
    Object.assign(toolMenuItems[id], createLabeledMenuItemState())
  })
  Object.values(sidebarTabs).forEach((state) => {
    state.disabled = false
  })
}

function clearSyncTimer() {
  if (!syncTimer) return
  window.clearInterval(syncTimer)
  syncTimer = null
}

function clearSyncHighlight() {
  if (syncHighlightTimer) {
    window.clearTimeout(syncHighlightTimer)
    syncHighlightTimer = null
  }
  activeSyncHighlightEl?.remove()
  activeSyncHighlightEl = null
}

function closePdfContextMenu() {
  pdfContextMenu.show = false
  pdfContextMenu.selectedText = ''
  pdfContextMenu.hasPendingSelection = false
}

function createEmbeddedSidebarButton(doc, viewKey, labelKey) {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = `altals-pdf-sidebar-tab altals-pdf-sidebar-tab-${viewKey}`
  button.dataset.view = viewKey
  const label = t(labelKey)
  button.setAttribute('role', 'tab')
  button.setAttribute('title', label)
  button.setAttribute('aria-label', label)
  button.addEventListener('click', () => {
    activateSidebarView(viewKey)
  })
  return button
}

function createEmbeddedSidebarActionButton(doc) {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'altals-pdf-sidebar-action'
  const label = t('Find Current Outline Item')
  button.setAttribute('title', label)
  button.setAttribute('aria-label', label)
  button.addEventListener('click', () => {
    focusCurrentOutlineItem()
  })
  return button
}

function ensureEmbeddedSidebarShell() {
  const doc = getPdfDocument()
  const viewsManager = getPdfElement('viewsManager')
  const content = getPdfElement('viewsManagerContent')
  if (!doc || !viewsManager || !content) {
    annotationsSidebarTarget.value = null
    return null
  }

  let shell = doc.getElementById(PDF_EMBEDDED_SIDEBAR_SHELL_ID)
  if (!shell) {
    shell = doc.createElement('div')
    shell.id = PDF_EMBEDDED_SIDEBAR_SHELL_ID
    shell.className = 'altals-pdf-sidebar-shell'

    const tabs = doc.createElement('div')
    tabs.className = 'altals-pdf-sidebar-tabs'
    tabs.setAttribute('role', 'tablist')
    tabs.setAttribute('aria-label', t('Views'))
    tabs.append(
      createEmbeddedSidebarButton(doc, 'outlines', 'Outline'),
      createEmbeddedSidebarButton(doc, 'thumbnails', 'Thumbnails'),
      createEmbeddedSidebarButton(doc, 'attachments', 'Attachments'),
      createEmbeddedSidebarButton(doc, 'annotations', 'Highlights'),
    )

    const action = createEmbeddedSidebarActionButton(doc)
    shell.append(tabs, action)
    shell.addEventListener('mousedown', () => {
      markPaneActive()
    })
    viewsManager.insertBefore(shell, content)
  }

  let annotationsView = doc.getElementById(PDF_EMBEDDED_ANNOTATIONS_VIEW_ID)
  if (!annotationsView) {
    annotationsView = doc.createElement('div')
    annotationsView.id = PDF_EMBEDDED_ANNOTATIONS_VIEW_ID
    annotationsView.className = 'altals-pdf-sidebar-panel altals-pdf-sidebar-panel-annotations'
    viewsManager.insertBefore(annotationsView, content)
  }
  annotationsSidebarTarget.value = annotationsView

  syncEmbeddedSidebarShell()
  return shell
}

function syncEmbeddedSidebarShell() {
  const shell = getPdfDocument()?.getElementById(PDF_EMBEDDED_SIDEBAR_SHELL_ID)
  if (!shell) return

  shell.querySelectorAll('[data-view]').forEach((button) => {
    const viewKey = button.getAttribute('data-view')
    const active = pdfUi.sidebarView === viewKey
    const disabled = !!sidebarTabs[viewKey]?.disabled
    const labelMap = {
      outlines: 'Outline',
      thumbnails: 'Thumbnails',
      attachments: 'Attachments',
      annotations: 'Highlights',
    }
    const label = t(labelMap[viewKey] || 'Views')
    button.setAttribute('title', label)
    button.setAttribute('aria-label', label)
    button.classList.toggle('altals-pdf-sidebar-tab-active', active)
    button.disabled = disabled
    button.setAttribute('aria-selected', active ? 'true' : 'false')
    button.setAttribute('tabindex', active ? '0' : '-1')
  })

  const action = shell.querySelector('.altals-pdf-sidebar-action')
  if (action) {
    const label = t('Find Current Outline Item')
    action.setAttribute('title', label)
    action.setAttribute('aria-label', label)
    action.hidden = pdfUi.sidebarView !== 'outlines'
    action.disabled = !pdfUi.sidebarCanFocusCurrentOutline
  }

  syncEmbeddedSidebarView()
}

function syncEmbeddedSidebarView() {
  const annotationsView = getPdfDocument()?.getElementById(PDF_EMBEDDED_ANNOTATIONS_VIEW_ID)
  const content = getPdfElement('viewsManagerContent')
  const showAnnotations = pdfUi.sidebarView === 'annotations'

  if (annotationsView) {
    annotationsView.hidden = !showAnnotations
    annotationsView.setAttribute('aria-hidden', showAnnotations ? 'false' : 'true')
  }
  if (content) {
    content.hidden = showAnnotations
    content.setAttribute('aria-hidden', showAnnotations ? 'true' : 'false')
  }
}

function syncSidebarShellStateFromContainer() {
  syncPdfUi()
}

function attachSidebarStateObserver() {
  sidebarStateObserver?.disconnect()
  sidebarStateObserver = null

  const outerContainer = getPdfElement('outerContainer')
  if (typeof MutationObserver !== 'function' || !outerContainer) return

  syncSidebarShellStateFromContainer()
  sidebarStateObserver = new MutationObserver(() => {
    syncSidebarShellStateFromContainer()
  })
  sidebarStateObserver.observe(outerContainer, {
    attributes: true,
    attributeFilter: ['class'],
  })
}

function resetViewerReadyPromise() {
  viewerReadyPromise = new Promise((resolve, reject) => {
    resolveViewerReady = resolve
    rejectViewerReady = reject
  })
}

function getPdfWindow() {
  return iframeRef.value?.contentWindow || null
}

function getPdfDocument() {
  return iframeRef.value?.contentDocument || null
}

function getPdfApp() {
  return getPdfWindow()?.PDFViewerApplication || null
}

function getPdfElement(...ids) {
  const doc = getPdfDocument()
  if (!doc) return null
  for (const id of ids) {
    const element = doc.getElementById(id)
    if (element) return element
  }
  return null
}

function getViewerRoot() {
  return getPdfElement('viewer') || getPdfDocument()?.querySelector('.pdfViewer') || null
}

function getViewerSelection() {
  try {
    return getPdfWindow()?.getSelection?.() || null
  } catch {
    return null
  }
}

function getPageView(pageNumber) {
  const viewer = getPdfApp()?.pdfViewer
  const targetPage = Number(pageNumber)
  if (!viewer || !Number.isInteger(targetPage) || targetPage < 1) return null
  if (typeof viewer.getPageView === 'function') {
    return viewer.getPageView(targetPage - 1) || null
  }
  return viewer._pages?.[targetPage - 1] || null
}

function isPdfElementVisible(element) {
  if (!element) return false
  if (element.hidden || element.closest?.('[hidden]')) return false
  const win = getPdfWindow()
  let current = element
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const style = win?.getComputedStyle?.(current)
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false
    }
    current = current.parentElement
  }
  return true
}

function getPdfViewportWidth() {
  return Number(
    getPdfDocument()?.documentElement?.clientWidth
    || getPdfDocument()?.body?.clientWidth
    || iframeRef.value?.clientWidth
    || 0
  )
}

function isPdfResponsiveVisible(element) {
  if (!element) return false
  if (element.hidden || element.closest?.('[hidden]')) return false
  if (element.classList?.contains('hidden')) return false

  const viewportWidth = getPdfViewportWidth()
  if (!viewportWidth) return true

  const isHiddenMedium = element.classList?.contains('hiddenMediumView') || !!element.closest?.('.hiddenMediumView')
  const isVisibleMedium = element.classList?.contains('visibleMediumView') || !!element.closest?.('.visibleMediumView')
  const isHiddenSmall = element.classList?.contains('hiddenSmallView') || !!element.closest?.('.hiddenSmallView')
  const isScaleSelect = element.id === 'scaleSelectContainer' || !!element.closest?.('#scaleSelectContainer')

  if (viewportWidth <= 750 && isHiddenMedium) return false
  if (viewportWidth > 750 && isVisibleMedium) return false
  if (viewportWidth <= 690 && isHiddenSmall) return false
  if (viewportWidth <= 560 && isScaleSelect) return false

  return true
}

function syncToolbarButtonState(id) {
  const element = getPdfElement(id)
  const state = toolbarButtons[id]
  if (!state) return

  state.visible = isPdfElementVisible(element)
  state.disabled = !element || !!element.disabled
  state.active = !!element?.classList?.contains('toggled') || element?.getAttribute?.('aria-pressed') === 'true'
  state.expanded = element?.getAttribute?.('aria-expanded') === 'true'
}

function syncMenuItemState(id) {
  const element = getPdfElement(id)
  const state = toolMenuItems[id]
  if (!state) return

  state.visible = isPdfResponsiveVisible(element)
  state.disabled = !element || element.getAttribute?.('aria-disabled') === 'true' || !!element.disabled || element.getAttribute?.('href') === '#'
  state.active = !!element?.classList?.contains('toggled') || element?.getAttribute?.('aria-checked') === 'true' || element?.getAttribute?.('aria-pressed') === 'true'
  const translatedLabelKey = PDF_TOOL_MENU_LABEL_KEYS[id]
  state.label = translatedLabelKey
    ? t(translatedLabelKey)
    : (element?.textContent?.trim?.() || state.label || id)
}

function syncActiveEditorToolPanel() {
  const activeEditorPanel = Object.entries(EDITOR_TOOL_BUTTON_TO_PANEL)
    .find(([buttonId]) => toolbarButtons[buttonId]?.active)?.[1] || ''

  if (activeEditorPanel) {
    activeToolbarPanel.value = activeEditorPanel
    return
  }

  if (['freetext', 'ink', 'stamp'].includes(activeToolbarPanel.value)) {
    activeToolbarPanel.value = ''
  }
}

function syncExternalControlState() {
  const freeTextColor = getPdfElement('editorFreeTextColor')
  const freeTextFontSize = getPdfElement('editorFreeTextFontSize')
  const inkColor = getPdfElement('editorInkColor')
  const inkThickness = getPdfElement('editorInkThickness')
  const inkOpacity = getPdfElement('editorInkOpacity')
  const stampAddImage = getPdfElement('editorStampAddImage')

  editorParams.freeTextColor = freeTextColor?.value || editorParams.freeTextColor
  editorParams.freeTextFontSize = Number(freeTextFontSize?.valueAsNumber || freeTextFontSize?.value || 10)
  editorParams.inkColor = inkColor?.value || editorParams.inkColor
  editorParams.inkThickness = Number(inkThickness?.valueAsNumber || inkThickness?.value || 1)
  editorParams.inkOpacity = Number(inkOpacity?.valueAsNumber || inkOpacity?.value || 1)
  editorParams.stampAddLabel = stampAddImage?.textContent?.trim?.() || editorParams.stampAddLabel || t('Add image')
}

function resolveSidebarView(viewsManager) {
  const active = Number(viewsManager?.active || 0)
  if (PDF_SIDEBAR_VIEW_CODE_TO_KEY[active]) {
    return PDF_SIDEBAR_VIEW_CODE_TO_KEY[active]
  }

  const thumbnailsView = getPdfElement('thumbnailsView')
  const outlinesView = getPdfElement('outlinesView')
  const attachmentsView = getPdfElement('attachmentsView')
  const layersView = getPdfElement('layersView')

  if (outlinesView && !outlinesView.classList.contains('hidden')) return 'outlines'
  if (attachmentsView && !attachmentsView.classList.contains('hidden')) return 'attachments'
  if (layersView && !layersView.classList.contains('hidden')) return 'layers'
  if (thumbnailsView && !thumbnailsView.classList.contains('hidden')) return 'thumbnails'
  return 'thumbnails'
}

function syncSidebarTabState(viewKey) {
  if (viewKey === 'annotations') {
    sidebarTabs.annotations.disabled = false
    return
  }
  const buttonId = PDF_SIDEBAR_VIEW_BUTTON_IDS[viewKey]
  const element = getPdfElement(buttonId)
  if (!sidebarTabs[viewKey]) return
  sidebarTabs[viewKey].disabled = !element
    || !!element.hidden
    || !!element.closest?.('[hidden]')
    || !!element.disabled
    || element.getAttribute?.('aria-disabled') === 'true'
}

function maybeResolveInitialSidebarViewPreference() {
  if (sidebarInitialViewResolved || sidebarEverOpened) return

  const app = getPdfApp()
  const viewsManager = app?.viewsManager
  if (!viewsManager || !app?.pdfDocument || Number(app.pagesCount || 0) <= 0) return

  const activeView = resolveSidebarView(viewsManager)
  if (activeView && activeView !== 'thumbnails') {
    sidebarInitialViewResolved = true
    return
  }

  const outlineButton = getPdfElement(PDF_SIDEBAR_VIEW_BUTTON_IDS.outlines)
  if (outlineButton && !outlineButton.disabled && !outlineButton.hidden) {
    outlineButton.click()
    syncPdfUi()
    sidebarInitialViewResolved = true
    return
  }

  const attachmentsButton = getPdfElement(PDF_SIDEBAR_VIEW_BUTTON_IDS.attachments)
  if (attachmentsButton && !attachmentsButton.disabled && !attachmentsButton.hidden) {
    attachmentsButton.click()
    syncPdfUi()
    sidebarInitialViewResolved = true
  }
}

function setPdfElementText(id, label) {
  const element = getPdfElement(id)
  if (element) {
    element.textContent = label
  }
}

function setPdfElementTitle(id, label) {
  const element = getPdfElement(id)
  if (element) {
    element.setAttribute('title', label)
    element.setAttribute('aria-label', label)
  }
}

function getViewsManagerActiveLabel() {
  const thumbnailsView = getPdfElement('thumbnailsView')
  const outlinesView = getPdfElement('outlinesView')
  const attachmentsView = getPdfElement('attachmentsView')
  const layersView = getPdfElement('layersView')

  if (thumbnailsView && !thumbnailsView.classList.contains('hidden')) return t(PDF_VIEWS_MANAGER_LABELS.thumbnails)
  if (outlinesView && !outlinesView.classList.contains('hidden')) return t(PDF_VIEWS_MANAGER_LABELS.outlines)
  if (attachmentsView && !attachmentsView.classList.contains('hidden')) return t(PDF_VIEWS_MANAGER_LABELS.attachments)
  if (layersView && !layersView.classList.contains('hidden')) return t(PDF_VIEWS_MANAGER_LABELS.layers)
  return t(PDF_VIEWS_MANAGER_LABELS.outlines)
}

function syncPdfViewerLocalizedLabels() {
  setPdfElementTitle('viewsManagerToggleButton', t('Toggle Sidebar'))
  setPdfElementTitle('viewsManagerSelectorButton', t('Views'))
  setPdfElementTitle('viewsManagerCurrentOutlineButton', t('Find Current Outline Item'))

  setPdfElementText('viewsManagerHeaderLabel', getViewsManagerActiveLabel())
  setPdfElementText('thumbnailsViewMenu', t('Thumbnails'))
  setPdfElementText('outlinesViewMenu', t('Document outline'))
  setPdfElementText('attachmentsViewMenu', t('Attachments'))
  setPdfElementText('layersViewMenu', t('Layers'))
  ensureEmbeddedSidebarShell()
}

function getPageHeightInPdfPoints(pageView) {
  const rawHeight = Number(pageView?.viewport?.rawDims?.pageHeight)
  if (Number.isFinite(rawHeight) && rawHeight > 0) return rawHeight

  const viewBox = pageView?.pdfPage?.view
  if (Array.isArray(viewBox) && viewBox.length >= 4) {
    const height = Number(viewBox[3]) - Number(viewBox[1])
    if (Number.isFinite(height) && height > 0) return height
  }

  return null
}

function clickPdfElement(...ids) {
  const element = getPdfElement(...ids)
  if (!element || element.disabled) return false
  element.click()
  syncPdfUi()
  return true
}

function activateSidebarView(viewKey) {
  markPaneActive()
  if (viewKey === 'annotations') {
    sidebarViewOverride = 'annotations'
    pdfUi.sidebarView = 'annotations'
    if (!pdfUi.sidebarOpen) {
      clickPdfElement('viewsManagerToggleButton')
    }
    syncEmbeddedSidebarShell()
    return
  }

  sidebarViewOverride = ''
  const buttonId = PDF_SIDEBAR_VIEW_BUTTON_IDS[viewKey]
  if (!buttonId || sidebarTabs[viewKey]?.disabled) return
  if (!pdfUi.sidebarOpen) {
    clickPdfElement('viewsManagerToggleButton')
  }
  clickPdfElement(buttonId)
}

function focusCurrentOutlineItem() {
  markPaneActive()
  if (!pdfUi.sidebarCanFocusCurrentOutline) return
  clickPdfElement('viewsManagerCurrentOutlineButton')
}

function normalizeScaleOptions(select) {
  const options = Array.from(select?.options || [])
    .filter(option => option.value)
    .map(option => ({
      value: option.value,
      label: localizeScaleLabel(option.textContent),
    }))
  const customOption = options.find(option => option.value === 'custom')
  if (customOption && customOption.label) return options
  return options.filter(option => option.value !== 'custom')
}

function clearIframePointerGuards() {
  document.getElementById('resize-drag-iframe-block')?.remove()
  document.getElementById('split-drag-iframe-block')?.remove()
  iframeRef.value?.style?.setProperty('pointer-events', 'auto')
}

function readAppCssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function markPaneActive() {
  editorStore.setActivePane(props.paneId)
}

function createToolbarStyleText() {
  const bgPrimary = readAppCssVar('--bg-primary', isDark.value ? '#2c313c' : '#ffffff')
  const bgSecondary = readAppCssVar('--bg-secondary', isDark.value ? '#343b47' : '#f3f6fb')
  const bgTertiary = readAppCssVar('--bg-tertiary', isDark.value ? '#3b4452' : '#edf1f6')
  const bgHover = readAppCssVar('--bg-hover', isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)')
  const border = readAppCssVar('--border', isDark.value ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.26)')
  const fgPrimary = readAppCssVar('--fg-primary', isDark.value ? '#f7f9fc' : '#1f2937')
  const fgSecondary = readAppCssVar('--fg-secondary', isDark.value ? '#c7d0dc' : '#4b5563')
  const fgMuted = readAppCssVar('--fg-muted', isDark.value ? '#8b98ab' : '#6b7280')
  const accent = readAppCssVar('--accent', '#60a5fa')
  const errorColor = readAppCssVar('--error', '#ef4444')
  const uiFontSize = readAppCssVar('--ui-font-size', '12px')
  const uiFontCaption = readAppCssVar('--ui-font-caption', '11px')
  const uiFontMicro = readAppCssVar('--ui-font-micro', '10px')
  const shadow = isDark.value
    ? '0 10px 26px rgba(15, 23, 42, 0.32)'
    : '0 10px 26px rgba(15, 23, 42, 0.10)'

  const pageThemeCss = workspace.pdfThemedPages
    ? (isDark.value
      ? `
      #viewerContainer {
        background: color-mix(in srgb, #0f172a 76%, #111827) !important;
        filter: invert(0.86) hue-rotate(180deg) brightness(0.98) contrast(0.88) saturate(0.78) !important;
      }
      #thumbnailView,
      #thumbnailsView {
        filter: invert(0.86) hue-rotate(180deg) brightness(0.98) contrast(0.88) saturate(0.78) !important;
      }
      .page {
        box-shadow: 0 0 0 1px rgba(100, 116, 139, 0.24), 0 12px 28px rgba(15, 23, 42, 0.26) !important;
      }
    `
      : `
      #viewerContainer {
        background: color-mix(in srgb, #eef2f7 90%, #f8fafc) !important;
        filter: brightness(0.96) contrast(0.92) sepia(0.1) saturate(0.86) !important;
      }
      #thumbnailView,
      #thumbnailsView {
        filter: brightness(0.96) contrast(0.92) sepia(0.1) saturate(0.86) !important;
      }
      .page {
        box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.24), 0 8px 18px rgba(15, 23, 42, 0.06) !important;
      }
    `)
    : `
      #viewerContainer,
      #thumbnailView,
      #thumbnailsView {
        filter: none !important;
      }
    `

  const viewerChromeCss = usingExternalToolbar.value
    ? `
      :root,
      html,
      html[data-toolbar-density="compact"],
      html[data-toolbar-density="touch"] {
        --toolbar-height: 0px;
        --toolbar-vertical-padding: 0px;
        --toolbar-horizontal-padding: 0px;
        --main-color: ${fgPrimary};
        --toolbar-bg-color: ${bgSecondary};
        --sidebar-toolbar-bg-color: ${bgSecondary};
        --toolbar-border-color: ${border};
        --toolbar-border-bottom: 0;
        --toolbar-box-shadow: none;
        --toolbarSidebar-box-shadow: none;
        --toolbarSidebar-border-bottom: 0;
        --toolbar-icon-bg-color: ${fgSecondary};
        --toolbar-icon-hover-bg-color: ${fgPrimary};
        --button-hover-color: ${bgHover};
        --separator-color: ${border};
        --toggled-btn-color: ${fgPrimary};
        --toggled-btn-bg-color: color-mix(in srgb, ${accent} 16%, ${bgPrimary});
        --dropdown-btn-bg-color: ${bgPrimary};
        --field-color: ${fgPrimary};
        --field-bg-color: ${bgPrimary};
        --field-border-color: ${border};
        --doorhanger-bg-color: ${bgSecondary};
        --doorhanger-border-color: ${border};
        --doorhanger-hover-color: ${fgPrimary};
        --doorhanger-separator-color: ${border};
      }

      body {
        background-color: ${bgSecondary};
      }

      #toolbarContainer {
        position: absolute !important;
        inset: 0 0 auto 0 !important;
        z-index: 24 !important;
        height: 24px !important;
        min-height: 24px !important;
        padding: 0 6px !important;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        overflow: visible !important;
        pointer-events: none !important;
      }

      #toolbarContainer #toolbarViewer,
      #toolbarContainer #toolbarViewerLeft,
      #toolbarContainer #toolbarViewerMiddle,
      #toolbarContainer #toolbarViewerRight {
        height: 100% !important;
        min-height: 24px !important;
        align-items: center !important;
        overflow: visible !important;
      }

      #toolbarSidebar {
        display: none !important;
      }

      #toolbarContainer #toolbarViewerLeft > :not(#viewsManager),
      #toolbarContainer #toolbarViewerMiddle > *,
      #toolbarContainer #toolbarViewerRight > * {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      #toolbarContainer .toolbarButtonWithContainer,
      #toolbarContainer #viewsManager {
        overflow: visible !important;
      }

      #toolbarContainer #viewsManager,
      #toolbarContainer #viewsManager * {
        pointer-events: auto !important;
      }

      #findbar,
      #secondaryToolbar,
      .editorParamsToolbar {
        position: fixed !important;
        inset: -10000px auto auto -10000px !important;
        opacity: 0 !important;
        pointer-events: none !important;
        box-shadow: none !important;
      }

      #viewerContainer {
        inset: 0 !important;
      }

      #outerContainer {
        --altals-views-manager-width: 200px !important;
        --altals-views-manager-effective-width: min(var(--altals-views-manager-width), calc(100vw - 16px)) !important;
        --altals-views-manager-header-height: 24px !important;
        --viewsManager-width: var(--altals-views-manager-width) !important;
      }

      #sidebarContent {
        inset-block: 0 0 !important;
      }

      #viewsManager {
        --sidebar-width: var(--altals-views-manager-effective-width) !important;
        --sidebar-max-width: min(34vw, 360px);
        --text-color: ${fgPrimary};
        --button-fg: ${fgMuted};
        --button-bg: transparent;
        --button-hover-bg: ${bgHover};
        --button-active-bg: color-mix(in srgb, ${accent} 12%, transparent);
        --button-border-color: transparent;
        --button-hover-border-color: transparent;
        --button-active-border-color: color-mix(in srgb, ${accent} 30%, transparent);
        --button-focus-no-bg: ${bgHover};
        --button-focus-outline-color: color-mix(in srgb, ${accent} 72%, transparent);
        --button-focus-border-color: color-mix(in srgb, ${accent} 42%, transparent);
        --status-border-color: color-mix(in srgb, ${border} 88%, transparent);
        --status-actions-bg: transparent;
        --status-undo-bg: color-mix(in srgb, ${accent} 8%, ${bgSecondary});
        --status-waiting-bg: color-mix(in srgb, ${bgTertiary} 78%, ${bgSecondary});
        --indicator-color: ${accent};
        --indicator-warning-color: ${accent};
        --status-warning-bg: color-mix(in srgb, ${accent} 8%, ${bgSecondary});
        --header-shadow: none !important;
        --image-border-width: 1px;
        --image-border-color: color-mix(in srgb, ${border} 92%, transparent);
        --image-hover-border-color: color-mix(in srgb, ${border} 70%, transparent);
        --image-current-border-color: color-mix(in srgb, ${accent} 60%, transparent);
        --image-current-focused-outline-color: ${accent};
        --image-page-number-bg: transparent;
        --image-page-number-fg: ${fgMuted};
        --image-current-page-number-bg: transparent;
        --image-current-page-number-fg: ${fgPrimary};
        --image-shadow: 0 0 0 1px var(--image-border-color);
        --image-hover-shadow: 0 0 0 1px var(--image-hover-border-color);
        --image-current-shadow: 0 0 0 1px var(--image-current-border-color);
        --image-dragging-placeholder-bg: ${bgTertiary};
        --multiple-dragging-text-color: ${fgPrimary};
        --treeitem-color: ${fgSecondary};
        --treeitem-bg-color: ${bgHover};
        --treeitem-hover-color: ${fgPrimary};
        --treeitem-selected-color: ${fgPrimary};
        --treeitem-selected-bg-color: color-mix(in srgb, ${accent} 12%, transparent);
        --header-shadow: none !important;
        position: fixed !important;
        inset-block: 0 !important;
        inset-inline-start: calc(-1 * var(--altals-views-manager-effective-width) - 8px) !important;
        height: auto !important;
        max-height: none !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        width: var(--sidebar-width) !important;
        min-width: 0 !important;
        max-width: var(--sidebar-width) !important;
        flex: 0 0 var(--sidebar-width) !important;
        padding: 0 !important;
        padding-block: 0 !important;
        color: ${fgPrimary} !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif !important;
        background: color-mix(in srgb, ${bgSecondary} 96%, ${bgPrimary}) !important;
        border-radius: 0 !important;
        border: 0 !important;
        border-inline-end: 1px solid color-mix(in srgb, ${border} 88%, transparent) !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        backdrop-filter: none !important;
      }

      #outerContainer.viewsManagerOpen #viewsManager {
        inset-inline-start: 0 !important;
        visibility: visible !important;
      }

      #outerContainer.viewsManagerOpen #viewerContainer:not(.pdfPresentationMode) {
        inset-inline-start: 0 !important;
      }

      #viewsManager .sidebarResizer {
        display: none !important;
      }

      #loadingBar {
        top: 0 !important;
      }

      #viewsManager #viewsManagerHeader,
      #viewsManager #viewsManagerSelector,
      #viewsManager #viewsManagerCurrentOutlineButton,
      #viewsManager #viewsManagerAddFileButton,
      #viewsManager #viewsManagerStatus {
        display: none !important;
      }

      #editorHighlight,
      #editorHighlightButton,
      #editorHighlightParamsToolbar {
        display: none !important;
      }

      #viewsManager #viewsManagerContent {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        padding-top: 0 !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        flex: none !important;
        height: var(--altals-views-manager-header-height) !important;
        min-height: var(--altals-views-manager-header-height) !important;
        padding: 0 6px !important;
        box-sizing: border-box !important;
        border-bottom: 1px solid color-mix(in srgb, ${border} 88%, transparent) !important;
        background: color-mix(in srgb, ${bgSecondary} 96%, ${bgPrimary}) !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tabs {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        min-width: 0 !important;
        flex: 1 1 auto !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab,
      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-action {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: none !important;
        width: 20px !important;
        min-width: 20px !important;
        height: 20px !important;
        padding: 0 !important;
        border-radius: 7px !important;
        border: 1px solid transparent !important;
        background: transparent !important;
        color: ${fgMuted} !important;
        line-height: 1 !important;
        box-sizing: border-box !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-action {
        margin-left: auto !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab::before,
      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-action::before {
        content: "" !important;
        display: block !important;
        width: 13px !important;
        height: 13px !important;
        background-color: currentColor !important;
        -webkit-mask-repeat: no-repeat !important;
        mask-repeat: no-repeat !important;
        -webkit-mask-position: center !important;
        mask-position: center !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab-outlines::before {
        -webkit-mask-image: url('/pdfjs-viewer/web/images/toolbarButton-viewOutline.svg') !important;
        mask-image: url('/pdfjs-viewer/web/images/toolbarButton-viewOutline.svg') !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab-thumbnails::before {
        -webkit-mask-image: url('/pdfjs-viewer/web/images/pages_viewButton.svg') !important;
        mask-image: url('/pdfjs-viewer/web/images/pages_viewButton.svg') !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab-attachments::before {
        -webkit-mask-image: url('/pdfjs-viewer/web/images/toolbarButton-viewAttachments.svg') !important;
        mask-image: url('/pdfjs-viewer/web/images/toolbarButton-viewAttachments.svg') !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab-annotations::before {
        -webkit-mask-image: url('/pdfjs-viewer/web/images/toolbarButton-editorHighlight.svg') !important;
        mask-image: url('/pdfjs-viewer/web/images/toolbarButton-editorHighlight.svg') !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-action::before {
        -webkit-mask-image: url('/pdfjs-viewer/web/images/toolbarButton-currentOutlineItem.svg') !important;
        mask-image: url('/pdfjs-viewer/web/images/toolbarButton-currentOutlineItem.svg') !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab:hover:not(:disabled),
      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-action:hover:not(:disabled) {
        background: ${bgHover} !important;
        color: ${fgPrimary} !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab.altals-pdf-sidebar-tab-active {
        color: ${fgPrimary} !important;
        border-color: color-mix(in srgb, ${accent} 32%, transparent) !important;
        background: color-mix(in srgb, ${accent} 12%, ${bgPrimary}) !important;
      }

      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-tab:disabled,
      #${PDF_EMBEDDED_SIDEBAR_SHELL_ID} .altals-pdf-sidebar-action:disabled {
        opacity: 0.45 !important;
        cursor: default !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-sidebar-shell {
        display: flex !important;
        flex-direction: column !important;
        position: static !important;
        inset: auto !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        min-height: 100% !important;
        border-left: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        background: transparent !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-sidebar-header {
        display: flex !important;
        align-items: center !important;
        min-height: 28px !important;
        padding: 0 10px !important;
        border-bottom: 1px solid color-mix(in srgb, ${border} 88%, transparent) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-sidebar-title {
        color: ${fgPrimary} !important;
        font-size: ${uiFontSize} !important;
        font-weight: 600 !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-list {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow: auto !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        padding: 10px !important;
        box-sizing: border-box !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-empty,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-pending,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-item {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
        padding: 10px !important;
        border-radius: 10px !important;
        box-sizing: border-box !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-empty {
        border: 1px dashed color-mix(in srgb, ${border} 85%, transparent) !important;
        color: ${fgMuted} !important;
        font-size: ${uiFontSize} !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-empty-hint {
        line-height: 1.4 !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-pending {
        border: 1px solid color-mix(in srgb, ${accent} 24%, transparent) !important;
        background: color-mix(in srgb, ${accent} 8%, transparent) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-pending-label,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-page,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-open {
        color: ${accent} !important;
        font-size: ${uiFontCaption} !important;
        font-weight: 600 !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-pending-quote,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-quote {
        color: ${fgPrimary} !important;
        font-size: ${uiFontSize} !important;
        line-height: 1.5 !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-item {
        border: 1px solid color-mix(in srgb, ${border} 84%, transparent) !important;
        background: color-mix(in srgb, ${bgPrimary} 82%, ${bgSecondary}) !important;
        outline: none !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-item:hover {
        border-color: color-mix(in srgb, ${accent} 18%, transparent) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-item-active {
        border-color: color-mix(in srgb, ${accent} 36%, transparent) !important;
        box-shadow: 0 0 0 1px color-mix(in srgb, ${accent} 14%, transparent) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-item-header,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-actions,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-header,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-actions {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-date,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-meta,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-status {
        color: ${fgMuted} !important;
        font-size: ${uiFontMicro} !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-delete {
        padding-inline: 8px !important;
        color: ${fgMuted} !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-delete:hover,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-secondary:hover {
        color: ${errorColor} !important;
        background: color-mix(in srgb, ${errorColor} 8%, transparent) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-note-shell {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-primary,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-note-create,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-primary,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-secondary {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: 24px !important;
        padding: 0 10px !important;
        border-radius: 6px !important;
        font-size: ${uiFontCaption} !important;
        transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-primary,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-primary {
        border: 1px solid color-mix(in srgb, ${accent} 28%, transparent) !important;
        background: color-mix(in srgb, ${accent} 10%, transparent) !important;
        color: ${accent} !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-primary:hover,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-primary:hover,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-note-create:hover {
        background: color-mix(in srgb, ${accent} 16%, transparent) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .pdf-annotation-note-create,
      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-secondary {
        border: 1px solid color-mix(in srgb, ${border} 88%, transparent) !important;
        background: transparent !important;
        color: ${fgMuted} !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card {
        display: grid !important;
        gap: 8px !important;
        padding: 10px !important;
        border-radius: 10px !important;
        border: 1px solid color-mix(in srgb, ${border} 88%, transparent) !important;
        background: color-mix(in srgb, ${bgPrimary} 86%, ${bgSecondary}) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-active {
        border-color: color-mix(in srgb, ${accent} 24%, transparent) !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-title {
        font-size: ${uiFontCaption} !important;
        font-weight: 700 !important;
        color: ${fgPrimary} !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-quote {
        color: ${fgSecondary} !important;
        font-size: ${uiFontCaption} !important;
        line-height: 1.45 !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }

      #${PDF_EMBEDDED_ANNOTATIONS_VIEW_ID} .research-note-card-textarea {
        width: 100% !important;
        min-height: 64px !important;
        resize: vertical !important;
        border-radius: 8px !important;
        border: 1px solid ${border} !important;
        background: color-mix(in srgb, ${bgPrimary} 92%, ${bgSecondary}) !important;
        color: ${fgPrimary} !important;
        padding: 8px 9px !important;
        font-size: ${uiFontCaption} !important;
        line-height: 1.45 !important;
        box-sizing: border-box !important;
      }

      #viewsManager #thumbnailsView,
      #viewsManager #outlinesView,
      #viewsManager #attachmentsView,
      #viewsManager #layersView {
        inset: 0 !important;
      }

      #viewsManager #outlinesView,
      #viewsManager #outlinesView .treeItem,
      #viewsManager #outlinesView .treeItems,
      #viewsManager #attachmentsView,
      #viewsManager #attachmentsView ul,
      #viewsManager #attachmentsView li {
        min-width: 0 !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      #viewsManager #outlinesView .treeItem > a,
      #viewsManager #attachmentsView li > a {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }
    `
    : `
      :root,
      html,
      html[data-toolbar-density="compact"],
      html[data-toolbar-density="touch"] {
        --toolbar-height: 24px;
        --toolbar-vertical-padding: 0px;
        --toolbar-horizontal-padding: 6px;
        --main-color: ${fgPrimary};
        --toolbar-bg-color: ${bgSecondary};
        --sidebar-toolbar-bg-color: ${bgSecondary};
        --toolbar-border-color: ${border};
        --toolbar-border-bottom: 1px solid ${border};
        --toolbar-box-shadow: none;
        --toolbarSidebar-box-shadow: none;
        --toolbarSidebar-border-bottom: 1px solid ${border};
        --toolbar-icon-bg-color: ${fgSecondary};
        --toolbar-icon-hover-bg-color: ${fgPrimary};
        --button-hover-color: ${bgHover};
        --separator-color: ${border};
        --toggled-btn-color: ${fgPrimary};
        --toggled-btn-bg-color: color-mix(in srgb, ${accent} 16%, ${bgPrimary});
        --dropdown-btn-bg-color: ${bgPrimary};
        --field-color: ${fgPrimary};
        --field-bg-color: ${bgPrimary};
        --field-border-color: ${border};
        --doorhanger-bg-color: ${bgSecondary};
        --doorhanger-border-color: ${border};
        --doorhanger-hover-color: ${fgPrimary};
        --doorhanger-separator-color: ${border};
      }

      body {
        background-color: ${bgSecondary};
      }

      #toolbarContainer,
      #toolbarSidebar {
        height: 24px !important;
        min-height: 24px !important;
        padding: 0 6px !important;
        box-sizing: border-box;
        background-color: ${bgSecondary} !important;
      }

      #toolbarContainer {
        border-bottom: 1px solid ${border};
      }

      #toolbarSidebar {
        border-bottom: 1px solid ${border};
        box-shadow: none;
      }

      #toolbarContainer #toolbarViewer {
        height: 100%;
        align-items: center;
      }

      #toolbarViewerLeft,
      #toolbarViewerMiddle,
      #toolbarViewerRight {
        align-items: center;
        gap: 6px;
      }

      .toolbarButton,
      .toolbarButtonWithContainer {
        height: 20px;
      }

      .toolbarButton {
        width: 20px;
        border-radius: 6px;
        border: 1px solid transparent;
      }

      .toolbarButtonWithContainer {
        height: 20px;
      }

      .toolbarButton::before {
        width: 14px;
        height: 14px;
      }

      .toolbarField {
        height: 20px;
        padding: 0 8px;
        border-radius: 6px;
        background-color: color-mix(in srgb, ${bgPrimary} 82%, ${bgSecondary});
        border-color: ${border};
        color: ${fgPrimary};
        font-size: 11px;
        line-height: 1;
      }

      .toolbarField::placeholder {
        color: ${fgMuted};
      }

      .toolbarButton:is(:hover,:focus-visible) {
        background-color: ${bgHover};
      }

      .toolbarButton.toggled {
        color: ${accent};
        border-color: color-mix(in srgb, ${accent} 35%, transparent);
        background-color: color-mix(in srgb, ${accent} 14%, transparent);
      }

      .toolbarButton.toggled::before {
        background-color: ${accent};
      }

      .toolbarButtonSpacer {
        width: 1px !important;
        height: 12px !important;
        background: color-mix(in srgb, ${border} 85%, transparent);
      }

      .splitToolbarButtonSeparator {
        height: 12px;
        align-self: center;
        opacity: 1;
      }

      #pageNumber {
        width: 36px;
        text-align: center;
        font-size: 11px;
        font-weight: 600;
      }

      #numPages,
      .toolbarLabel,
      #findResultsCount,
      #findMsg {
        color: ${fgSecondary};
        font-size: 11px;
      }

      #scaleSelectContainer {
        height: 20px;
        min-width: 120px;
        overflow: hidden;
        border: 1px solid ${border};
        border-radius: 6px;
        background-color: color-mix(in srgb, ${bgPrimary} 82%, ${bgSecondary});
      }

      #scaleSelect {
        height: 100%;
        padding-inline: 8px 24px;
        border: 0;
        background: transparent;
        color: ${fgPrimary};
        font-size: 11px;
      }

      #findbar {
        margin-top: 8px;
        min-width: 360px;
        max-width: calc(100vw - 16px);
        border: 1px solid ${border};
        border-radius: 10px;
        background-color: ${bgSecondary};
        box-shadow: ${shadow};
      }

      #findbar #findInputContainer {
        margin-inline-start: 0;
      }

      #findbar #findInput {
        width: 200px;
        color: ${fgPrimary};
      }

      #findbar #findbarMessageContainer {
        gap: 6px;
      }

      #findbar #findResultsCount {
        color: ${fgMuted};
        background: transparent;
        padding-inline: 0;
      }

      #findbar .toggleButton {
        display: inline-flex;
        align-items: center;
        padding-inline: 8px;
      }

      #findbar .toggleButton:has(> input:checked) {
        background-color: color-mix(in srgb, ${accent} 14%, ${bgPrimary});
        color: ${fgPrimary};
      }

      #findbar .toggleButton:is(:hover, :has(> input:focus-visible)) {
        background-color: ${bgHover};
        color: ${fgPrimary};
      }

      #secondaryToolbar,
      .toolbarButtonWithContainer .editorParamsToolbar,
      #findbar {
        border-radius: 10px;
        box-shadow: ${shadow};
      }
    `

  return `
    ${viewerChromeCss}
    ${pageThemeCss}
  `
}

function applyTheme() {
  const doc = getPdfDocument()
  if (!doc?.documentElement || !doc.head) return

  doc.documentElement.style.setProperty('color-scheme', isDark.value ? 'dark' : 'light')

  let style = doc.getElementById(PDF_VIEWER_THEME_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = PDF_VIEWER_THEME_STYLE_ID
    doc.head.appendChild(style)
  }

  style.textContent = createToolbarStyleText()
}

function syncViewerAppZoom() {
  const doc = getPdfDocument()
  if (!doc?.documentElement) return

  const hostZoom = typeof document !== 'undefined'
    ? (document.documentElement.style.zoom || '')
    : ''

  if (hostZoom) {
    doc.documentElement.style.zoom = hostZoom
    doc.body?.style?.setProperty('zoom', hostZoom)
    return
  }

  doc.documentElement.style.removeProperty('zoom')
  doc.body?.style?.removeProperty('zoom')
}

function syncPdfUi() {
  const app = getPdfApp()
  const doc = getPdfDocument()
  if (!app?.pdfViewer || !doc) return

  const previousButton = doc.getElementById('previous')
  const nextButton = doc.getElementById('next')
  const zoomOutButton = doc.getElementById('zoomOutButton')
  const zoomInButton = doc.getElementById('zoomInButton')
  const scaleSelect = doc.getElementById('scaleSelect')
  const findResultsCount = doc.getElementById('findResultsCount')
  const findMsg = doc.getElementById('findMsg')
  const findbar = doc.getElementById('findbar')
  const findInput = doc.getElementById('findInput')
  const findHighlightAll = doc.getElementById('findHighlightAll')
  const findMatchCase = doc.getElementById('findMatchCase')
  const findMatchDiacritics = doc.getElementById('findMatchDiacritics')
  const findEntireWord = doc.getElementById('findEntireWord')
  const toggleButton = doc.getElementById('viewsManagerToggleButton')
  const viewsManager = app.viewsManager
  const currentOutlineButton = doc.getElementById('viewsManagerCurrentOutlineButton')

  pdfUi.ready = true
  pdfUi.pageNumber = Number(app.page || 1)
  pdfUi.pagesCount = Number(app.pagesCount || 0)
  pdfUi.canGoPrevious = !!previousButton && !previousButton.disabled
  pdfUi.canGoNext = !!nextButton && !nextButton.disabled
  pdfUi.canZoomOut = !!zoomOutButton && !zoomOutButton.disabled
  pdfUi.canZoomIn = !!zoomInButton && !zoomInButton.disabled
  pdfUi.sidebarOpen = typeof viewsManager?.isOpen === 'boolean'
    ? viewsManager.isOpen
    : toggleButton?.getAttribute('aria-expanded') === 'true'
  if (pdfUi.sidebarOpen) {
    sidebarEverOpened = true
  }
  const resolvedSidebarView = resolveSidebarView(viewsManager)
  pdfUi.sidebarView = sidebarViewOverride || resolvedSidebarView
  pdfUi.sidebarCanFocusCurrentOutline = !!currentOutlineButton && !currentOutlineButton.hidden && !currentOutlineButton.disabled
  if (!usingExternalToolbar.value) {
    pdfUi.searchOpen = !!findbar && !findbar.classList.contains('hidden')
    pdfUi.searchQuery = findInput?.value || ''
    pdfUi.searchHighlightAll = !!findHighlightAll?.checked
    pdfUi.searchCaseSensitive = !!findMatchCase?.checked
    pdfUi.searchMatchDiacritics = !!findMatchDiacritics?.checked
    pdfUi.searchEntireWord = !!findEntireWord?.checked
    searchDraft.value = pdfUi.searchQuery
  } else {
    pdfUi.searchOpen = searchOpen.value
    pdfUi.searchQuery = searchDraft.value
  }
  pdfUi.searchResultText = [findResultsCount?.textContent, findMsg?.textContent]
    .map(value => (value || '').trim())
    .filter(Boolean)
    .join(' ')

  if (scaleSelect) {
    pdfUi.scaleValue = scaleSelect.value || 'auto'
    pdfUi.scaleLabel = localizeScaleLabel(scaleSelect.options[scaleSelect.selectedIndex]?.textContent) || pdfUi.scaleLabel
    scaleOptions.value = normalizeScaleOptions(scaleSelect)
  } else {
    scaleOptions.value = []
  }

  syncToolbarButtonState('editorFreeTextButton')
  syncToolbarButtonState('editorInkButton')
  syncToolbarButtonState('editorStampButton')
  syncToolbarButtonState('printButton')
  syncToolbarButtonState('downloadButton')
  syncToolbarButtonState('secondaryToolbarToggleButton')
  syncActiveEditorToolPanel()
  syncMenuItemState('secondaryOpenFile')
  syncMenuItemState('secondaryPrint')
  syncMenuItemState('secondaryDownload')
  syncMenuItemState('presentationMode')
  syncMenuItemState('viewBookmark')
  syncMenuItemState('firstPage')
  syncMenuItemState('lastPage')
  syncMenuItemState('pageRotateCw')
  syncMenuItemState('pageRotateCcw')
  syncMenuItemState('cursorSelectTool')
  syncMenuItemState('cursorHandTool')
  syncMenuItemState('scrollPage')
  syncMenuItemState('scrollVertical')
  syncMenuItemState('scrollHorizontal')
  syncMenuItemState('scrollWrapped')
  syncMenuItemState('spreadNone')
  syncMenuItemState('spreadOdd')
  syncMenuItemState('spreadEven')
  syncMenuItemState('documentProperties')
  syncSidebarTabState('thumbnails')
  syncSidebarTabState('outlines')
  syncSidebarTabState('attachments')
  syncSidebarTabState('annotations')
  syncSidebarTabState('layers')
  maybeResolveInitialSidebarViewPreference()
  syncExternalControlState()
  syncPdfViewerLocalizedLabels()
  syncEmbeddedSidebarShell()

  if (pageInputRef.value !== document.activeElement) {
    pageInputValue.value = String(pdfUi.pageNumber || 1)
  }
}

function dispatchPdfEvent(type, detail = {}) {
  const app = getPdfApp()
  if (!app?.eventBus) return
  app.eventBus.dispatch(type, { source: app, ...detail })
  syncPdfUi()
}

function openSearch() {
  editorToolsExpanded.value = false
  activeToolbarPanel.value = ''
  if (!usingExternalToolbar.value) {
    const doc = getPdfDocument()
    const findbar = doc?.getElementById('findbar')
    if (findbar?.classList.contains('hidden')) {
      clickPdfElement('viewFindButton')
    }
    syncPdfUi()
    window.requestAnimationFrame(() => {
      doc?.getElementById('findInput')?.focus()
    })
    return
  }

  searchOpen.value = true
  searchDraft.value = pdfUi.searchQuery || searchDraft.value
  pdfUi.searchOpen = true
  nextTick(() => {
    searchInputRef.value?.focus()
    searchInputRef.value?.select?.()
  })
}

function closeSearch() {
  if (!usingExternalToolbar.value) {
    const findbar = getPdfElement('findbar')
    if (findbar && !findbar.classList.contains('hidden')) {
      clickPdfElement('viewFindButton')
    }
    pdfUi.searchOpen = false
    return
  }

  searchOpen.value = false
  pdfUi.searchOpen = false
}

function toggleSearch() {
  if (searchOpen.value || pdfUi.searchOpen) {
    closeSearch()
    return
  }
  openSearch()
}

function toggleToolbarPanel(panel) {
  closeSearch()
  activeToolbarPanel.value = activeToolbarPanel.value === panel ? '' : panel
}

function toggleSidebar() {
  clickPdfElement('viewsManagerToggleButton')
}

function goToPreviousPage() {
  clickPdfElement('previous')
}

function goToNextPage() {
  clickPdfElement('next')
}

function zoomOut() {
  clickPdfElement('zoomOutButton')
}

function zoomIn() {
  clickPdfElement('zoomInButton')
}

function submitPageNumber() {
  const targetPage = Number.parseInt(String(pageInputValue.value || '').trim(), 10)
  if (!Number.isInteger(targetPage) || targetPage < 1) {
    pageInputValue.value = String(pdfUi.pageNumber || 1)
    return
  }
  scrollToPage(targetPage)
}

function handleScaleSelectChange(event) {
  const nextValue = String(event?.target?.value || '').trim()
  const scaleSelect = getPdfElement('scaleSelect')
  if (!nextValue || !scaleSelect) return
  scaleSelect.value = nextValue
  scaleSelect.dispatchEvent(new Event('change', { bubbles: true }))
  syncPdfUi()
}

function dispatchExternalSearch({ findPrevious = false, type = '' } = {}) {
  const query = String(searchDraft.value || '').trim()
  pdfUi.searchQuery = query
  dispatchPdfEvent('find', {
    type,
    query,
    phraseSearch: true,
    caseSensitive: pdfUi.searchCaseSensitive,
    entireWord: pdfUi.searchEntireWord,
    highlightAll: pdfUi.searchHighlightAll,
    findPrevious,
    matchDiacritics: pdfUi.searchMatchDiacritics,
  })
}

function runSearch(findPrevious = false) {
  if (!searchDraft.value.trim()) return
  dispatchExternalSearch({
    findPrevious,
    type: findPrevious ? 'again' : '',
  })
}

function toggleSearchOption(key) {
  if (!(key in pdfUi)) return
  pdfUi[key] = !pdfUi[key]
  if (!searchDraft.value.trim()) return
  dispatchExternalSearch()
}

async function translateCurrentPdf() {
  closePdfTranslationMenu()
  if (!filePathRef.value || pdfTranslationBusy.value) return
  try {
    await pdfTranslateStore.startTranslation(filePathRef.value)
    toastStore.show(t('Started translating {name}', {
      name: fileNameFromPath(filePathRef.value),
    }), {
      type: 'success',
      duration: 2400,
    })
  } catch (translateError) {
    toastStore.show(
      translateError?.message || String(translateError),
      { type: 'error', duration: 4200 },
    )
  }
}

function openPdfTranslationMenu(event) {
  closePdfContextMenu()
  closeSearch()
  activeToolbarPanel.value = ''
  editorToolsExpanded.value = false
  pdfTranslationMenu.x = Number(event?.clientX || 0)
  pdfTranslationMenu.y = Number(event?.clientY || 0)
  pdfTranslationMenu.show = true
}

async function cancelCurrentPdfTranslation() {
  const taskId = currentPdfTranslationTask.value?.id
  if (!taskId) return
  try {
    await pdfTranslateStore.cancelTask(taskId)
    toastStore.show(t('Canceled'), {
      type: 'success',
      duration: 2200,
    })
  } catch (cancelError) {
    toastStore.show(
      cancelError?.message || String(cancelError),
      { type: 'error', duration: 4200 },
    )
  } finally {
    closePdfTranslationMenu()
  }
}

function proxyPdfButton(id) {
  clickPdfElement(id)
}

function activateEditorTool(buttonId, panel) {
  const state = toolbarButtons[buttonId]
  const wasActive = !!state?.active
  proxyPdfButton(buttonId)
  if (wasActive) {
    closeSearch()
    activeToolbarPanel.value = ''
    return
  }
  toggleToolbarPanel(panel)
}

function toggleEditorToolsExpanded() {
  closeSearch()
  activeToolbarPanel.value = ''
  editorToolsExpanded.value = !editorToolsExpanded.value
}

function toggleToolsMenu() {
  editorToolsExpanded.value = false
  toggleToolbarPanel('tools')
}

function setPdfInputValue(id, value, eventName = 'input') {
  const element = getPdfElement(id)
  if (!element) return
  element.value = String(value)
  element.dispatchEvent(new Event(eventName, { bubbles: true }))
  syncPdfUi()
}

function runToolMenuCommand(id) {
  getPdfElement(id)?.click?.()
  syncPdfUi()
  activeToolbarPanel.value = ''
}

function handleIframePointerDown() {
  closePdfContextMenu()
  closePdfTranslationMenu()
  closeSearch()
  activeToolbarPanel.value = ''
  editorToolsExpanded.value = false
}

function handleGlobalPointerDown(event) {
  if (pdfContextMenu.show) {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('.pdf-context-menu')) {
      closePdfContextMenu()
    }
  }
  if (pdfTranslationMenu.show) {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('.pdf-translate-context-menu')) {
      closePdfTranslationMenu()
    }
  }
  const toolbarShell = toolbarShellRef.value
  if (!toolbarShell) return
  if (toolbarShell.contains(event.target)) return
  closeSearch()
  activeToolbarPanel.value = ''
  editorToolsExpanded.value = false
}

function roundRectValue(value) {
  return Math.round(Number(value || 0) * 10000) / 10000
}

function normalizeSelectionText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolvePageElement(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  return element?.closest?.('.page[data-page-number]') || null
}

function normalizeRectToPage(clientRect, pageRect) {
  const pageWidth = Math.max(Number(pageRect?.width || 0), 1)
  const pageHeight = Math.max(Number(pageRect?.height || 0), 1)
  const left = Math.max(0, Number(clientRect?.left || 0) - pageRect.left)
  const top = Math.max(0, Number(clientRect?.top || 0) - pageRect.top)
  const right = Math.min(pageWidth, Number(clientRect?.right || 0) - pageRect.left)
  const bottom = Math.min(pageHeight, Number(clientRect?.bottom || 0) - pageRect.top)
  const width = right - left
  const height = bottom - top

  if (width < 1 || height < 1) return null

  return {
    left: roundRectValue(left / pageWidth),
    top: roundRectValue(top / pageHeight),
    width: roundRectValue(width / pageWidth),
    height: roundRectValue(height / pageHeight),
  }
}

function extractQuoteContext(pageText, quote) {
  const normalizedPageText = normalizeSelectionText(pageText)
  const normalizedQuote = normalizeSelectionText(quote)
  if (!normalizedPageText || !normalizedQuote) {
    return { prefix: '', suffix: '' }
  }

  const quoteIndex = normalizedPageText.indexOf(normalizedQuote)
  if (quoteIndex === -1) {
    return { prefix: '', suffix: '' }
  }

  const prefixStart = Math.max(0, quoteIndex - 120)
  const suffixStart = quoteIndex + normalizedQuote.length

  return {
    prefix: normalizedPageText.slice(prefixStart, quoteIndex).trim(),
    suffix: normalizedPageText.slice(suffixStart, suffixStart + 120).trim(),
  }
}

function convertPageOffsetToSyncTexPoint(pageNumber, x, y) {
  const pageView = getPageView(pageNumber)
  if (!pageView?.getPagePoint) return null

  const localX = Number(x)
  const localY = Number(y)
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return null

  const [pdfX, pdfY] = pageView.getPagePoint(localX, localY)
  const pageHeight = getPageHeightInPdfPoints(pageView)
  if (!Number.isFinite(pdfX) || !Number.isFinite(pdfY) || !Number.isFinite(pageHeight)) {
    return null
  }

  return {
    x: pdfX,
    y: pageHeight - pdfY,
    pdfX,
    pdfY,
    pageHeight,
  }
}

function convertSyncTexPointToPageOffset(pageNumber, x, y) {
  const pageView = getPageView(pageNumber)
  const pageElement = pageView?.div
  if (!pageView?.viewport || !pageElement) return null

  const xCoord = Number(x)
  const yCoord = Number(y)
  const pageHeight = getPageHeightInPdfPoints(pageView)
  if (!Number.isFinite(xCoord) || !Number.isFinite(yCoord) || !Number.isFinite(pageHeight)) {
    return null
  }

  const [localX, localY] = pageView.viewport.convertToViewportPoint(xCoord, pageHeight - yCoord)
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return null

  return {
    pageView,
    pageElement,
    x: localX,
    y: localY,
  }
}

function buildSelectionRect(range, pageElement, pageNumber) {
  const pageRect = pageElement?.getBoundingClientRect?.()
  if (!pageRect) return null

  const normalizedRects = Array.from(range.getClientRects())
    .map((rect) => normalizeRectToPage(rect, pageRect))
    .filter(Boolean)

  if (normalizedRects.length === 0) {
    const fallbackRect = normalizeRectToPage(range.getBoundingClientRect(), pageRect)
    if (fallbackRect) normalizedRects.push(fallbackRect)
  }

  if (normalizedRects.length === 0) return null

  const bounds = normalizedRects.reduce((acc, rect) => {
    const right = rect.left + rect.width
    const bottom = rect.top + rect.height
    return {
      left: Math.min(acc.left, rect.left),
      top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, right),
      bottom: Math.max(acc.bottom, bottom),
    }
  }, {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: 0,
    bottom: 0,
  })

  const pageWidth = Math.max(Number(pageRect.width || 0), 1)
  const pageHeight = Math.max(Number(pageRect.height || 0), 1)
  const localX = ((bounds.left + (bounds.right - bounds.left) / 2) * pageWidth)
  const localY = ((bounds.top + (bounds.bottom - bounds.top) / 2) * pageHeight)
  const focusPoint = convertPageOffsetToSyncTexPoint(pageNumber, localX, localY)

  return {
    rects: normalizedRects,
    bounds: {
      left: roundRectValue(bounds.left),
      top: roundRectValue(bounds.top),
      width: roundRectValue(bounds.right - bounds.left),
      height: roundRectValue(bounds.bottom - bounds.top),
    },
    focusPoint: focusPoint
      ? {
        x: focusPoint.x,
        y: focusPoint.y,
      }
      : null,
  }
}

function clearPendingSelection({ clearDomSelection = false } = {}) {
  pendingSelection.value = null
  if (!clearDomSelection) return
  try {
    getViewerSelection()?.removeAllRanges?.()
  } catch {}
}

function capturePendingSelection(showFeedback = true) {
  const selection = getViewerSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    clearPendingSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement
  if (!commonNode || !getViewerRoot()?.contains(commonNode)) {
    clearPendingSelection()
    return
  }

  const pageElement = resolvePageElement(range.startContainer)
  const endPageElement = resolvePageElement(range.endContainer)
  const quote = normalizeSelectionText(selection.toString())

  if (!quote) {
    clearPendingSelection()
    return
  }

  if (!pageElement || !endPageElement || pageElement !== endPageElement) {
    clearPendingSelection()
    if (showFeedback) {
      toastStore.showOnce(
        `pdf-selection:${filePathRef.value}:single-page`,
        t('Please keep PDF highlights within a single page.'),
        { type: 'error', duration: 3500 },
        5000,
      )
    }
    return
  }

  const pageNumber = Number(pageElement.dataset.pageNumber || 0)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    clearPendingSelection()
    return
  }

  const { prefix, suffix } = extractQuoteContext(pageElement.textContent || '', quote)
  pendingSelection.value = {
    page: pageNumber,
    quote,
    prefix,
    suffix,
    selectionRect: buildSelectionRect(range, pageElement, pageNumber),
  }
}

function handleViewerSelectionChange() {
  const selection = getViewerSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    clearPendingSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement
  if (!commonNode || !getViewerRoot()?.contains(commonNode)) {
    clearPendingSelection()
  }
}

function handleViewerMouseUp() {
  window.requestAnimationFrame(() => {
    capturePendingSelection(true)
  })
}

function getViewerSelectedText() {
  return normalizeSelectionText(getViewerSelection()?.toString?.() || '')
}

function handleViewerContextMenu(event) {
  try {
    event.preventDefault()
    event.stopPropagation()
  } catch {}

  closePdfTranslationMenu()
  capturePendingSelection(false)
  const iframeRect = iframeRef.value?.getBoundingClientRect?.()
  if (!iframeRect) return

  pdfContextMenu.x = iframeRect.left + Number(event.clientX || 0)
  pdfContextMenu.y = iframeRect.top + Number(event.clientY || 0)
  pdfContextMenu.selectedText = getViewerSelectedText()
  pdfContextMenu.hasPendingSelection = !!pendingSelection.value
  pdfContextMenu.show = true
}

function handleViewerExternalLinkClick(event) {
  if (event.defaultPrevented) return
  const doc = event.currentTarget
  const match = resolveExternalHttpAnchor(event.target, doc?.baseURI)
  if (!match) return
  event.preventDefault()
  event.stopPropagation()
  openExternalHttpUrl(match.url, doc?.baseURI).catch((error) => {
    console.warn('[pdf] failed to open external url:', error)
  })
}

function handleViewerExternalLinkKeydown(event) {
  if (event.defaultPrevented || event.key !== 'Enter') return
  const doc = event.currentTarget
  const match = resolveExternalHttpAnchor(event.target, doc?.baseURI)
  if (!match) return
  event.preventDefault()
  event.stopPropagation()
  openExternalHttpUrl(match.url, doc?.baseURI).catch((error) => {
    console.warn('[pdf] failed to open external url:', error)
  })
}

function openAnnotationsPanel() {
  activateSidebarView('annotations')
}

function openAnnotationsPanelFromMenu() {
  closePdfContextMenu()
  openAnnotationsPanel()
}

function runPdfContextCommand(action) {
  closePdfContextMenu()
  action?.()
}

function toggleSidebarFromContextMenu() {
  runPdfContextCommand(toggleSidebar)
}

function openSearchFromContextMenu() {
  closePdfContextMenu()
  openSearch()
}

async function copyTextToClipboard(text) {
  const value = String(text || '').trim()
  if (!value) return

  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {}

  if (typeof document === 'undefined') return
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

async function copyPdfSelection() {
  const text = pdfContextMenu.selectedText || getViewerSelectedText()
  closePdfContextMenu()
  await copyTextToClipboard(text)
}

function searchPdfQuery(query) {
  const text = String(query || '').trim()
  if (!text) return
  closePdfContextMenu()
  searchDraft.value = text
  pdfUi.searchQuery = text
  openSearch()
  nextTick(() => {
    dispatchExternalSearch()
  })
}

function searchSelectedTextInPdf() {
  searchPdfQuery(pendingSelection.value?.quote || pdfContextMenu.selectedText)
}

async function createAnnotationFromContextMenu() {
  closePdfContextMenu()
  if (!pendingSelection.value) {
    capturePendingSelection(false)
  }
  await createAnnotationFromSelection()
}

function showSyncHighlight(pageNumber, x, y) {
  clearSyncHighlight()

  const pageOffset = convertSyncTexPointToPageOffset(pageNumber, x, y)
  if (!pageOffset?.pageElement) return

  const highlight = getPdfDocument()?.createElement('div')
  if (!highlight) return
  highlight.className = 'altals-pdf-sync-highlight'
  highlight.style.left = `${pageOffset.x}px`
  highlight.style.top = `${pageOffset.y}px`
  pageOffset.pageElement.appendChild(highlight)
  activeSyncHighlightEl = highlight
  syncHighlightTimer = window.setTimeout(() => {
    clearSyncHighlight()
  }, 1450)
}

function focusAnnotation(annotation) {
  if (!annotation) return
  researchArtifactsStore.setActiveAnnotation(annotation.id)
  clearPendingSelection({ clearDomSelection: true })

  const focusPoint = annotation.anchor?.selectionRect?.focusPoint
  if (Number.isFinite(focusPoint?.x) && Number.isFinite(focusPoint?.y)) {
    scrollToLocation(annotation.page, focusPoint.x, focusPoint.y)
    return
  }

  scrollToPage(annotation.page)
}

function noteForAnnotation(annotationId) {
  return researchArtifactsStore.noteForAnnotation(annotationId)
}

function createNoteFromAnnotation(annotation) {
  if (!annotation?.id) return null
  const existing = noteForAnnotation(annotation.id)
  if (existing) {
    researchArtifactsStore.setActiveNote(existing.id)
    return existing
  }

  const note = researchArtifactsStore.createResearchNote({
    sourceAnnotationId: annotation.id,
    quote: annotation.quote,
    comment: '',
    sourceRef: {
      type: 'pdf_annotation',
      annotationId: annotation.id,
      referenceKey: annotation.referenceKey || props.referenceKey || null,
      pdfPath: annotation.pdfPath || filePathRef.value,
      page: annotation.page,
    },
  })
  researchArtifactsStore.setActiveNote(note.id)
  toastStore.show(t('Created note from page {page}', { page: annotation.page }), {
    type: 'success',
    duration: 2200,
  })
  return note
}

function updateNoteComment(note, comment) {
  if (!note?.id) return
  researchArtifactsStore.updateResearchNote(note.id, { comment })
}

function deleteNote(note) {
  if (!note?.id) return
  researchArtifactsStore.removeResearchNote(note.id)
  toastStore.show(t('Note deleted'), {
    type: 'success',
    duration: 2000,
  })
}

function insertNoteIntoManuscript(annotation) {
  if (!annotation?.id) return
  const note = noteForAnnotation(annotation.id) || createNoteFromAnnotation(annotation)
  if (!note) return

  const result = editorStore.insertResearchNoteIntoManuscript(note, annotation)
  if (!result?.ok) {
    toastStore.show(
      t('Open a text manuscript in another pane to insert this note.'),
      { type: 'error', duration: 4200 },
    )
    return
  }

  researchArtifactsStore.updateResearchNote(note.id, {
    insertedInto: {
      path: result.path,
      paneId: result.paneId,
      viewerType: result.viewerType,
      insertedAt: new Date().toISOString(),
    },
  })
  researchArtifactsStore.setActiveNote(note.id)
  toastStore.show(t('Inserted note into {name}', {
    name: result.path.split('/').pop() || result.path,
  }), {
    type: 'success',
    duration: 2600,
  })
}

function deleteAnnotation(annotation) {
  if (!annotation?.id) return
  researchArtifactsStore.removeAnnotation(annotation.id)
  toastStore.show(t('Highlight deleted'), {
    type: 'success',
    duration: 2200,
  })
  scheduleRenderAnnotationHighlights()
}

async function createAnnotationFromSelection() {
  const selection = pendingSelection.value
  if (!selection || !filePathRef.value) return

  const anchor = createPdfQuoteAnchor({
    pdfPath: filePathRef.value,
    referenceKey: props.referenceKey || null,
    page: selection.page,
    quote: selection.quote,
    prefix: selection.prefix,
    suffix: selection.suffix,
    selectionRect: selection.selectionRect,
  })

  const annotation = researchArtifactsStore.createAnnotation({
    pdfPath: filePathRef.value,
    referenceKey: props.referenceKey || null,
    page: selection.page,
    quote: selection.quote,
    anchor,
  })

  researchArtifactsStore.setActiveAnnotation(annotation.id)
  clearPendingSelection({ clearDomSelection: true })
  openAnnotationsPanel()
  await nextTick()
  scheduleRenderAnnotationHighlights()
  focusAnnotation(annotation)
  toastStore.show(t('Saved highlight on page {page}', { page: annotation.page }), {
    type: 'success',
    duration: 2400,
  })
}

function formatAnnotationTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function clearRenderedAnnotationHighlights() {
  getPdfDocument()
    ?.querySelectorAll?.('.altals-pdf-annotation-highlight')
    ?.forEach((element) => element.remove())
}

function renderAnnotationHighlights() {
  clearRenderedAnnotationHighlights()
  const doc = getPdfDocument()
  if (!doc || loading.value) return

  currentPdfAnnotations.value.forEach((annotation) => {
    const rects = annotation.anchor?.selectionRect?.rects
    if (!Array.isArray(rects) || rects.length === 0) return

    const pageNumber = Number(annotation.page || annotation.anchor?.page || 0)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return

    const pageElement = doc.querySelector(`.page[data-page-number="${pageNumber}"]`)
    if (!pageElement) return

    rects.forEach((rect) => {
      if (
        !Number.isFinite(rect?.left) ||
        !Number.isFinite(rect?.top) ||
        !Number.isFinite(rect?.width) ||
        !Number.isFinite(rect?.height)
      ) return
      const highlight = doc.createElement('div')
      highlight.className = 'altals-pdf-annotation-highlight'
      if (annotation.id === activeAnnotationId.value) {
        highlight.classList.add('altals-pdf-annotation-highlight-active')
      }
      highlight.dataset.annotationId = annotation.id
      highlight.style.left = `${rect.left * 100}%`
      highlight.style.top = `${rect.top * 100}%`
      highlight.style.width = `${rect.width * 100}%`
      highlight.style.height = `${rect.height * 100}%`
      pageElement.appendChild(highlight)
    })
  })
}

function scheduleRenderAnnotationHighlights() {
  if (annotationRenderScheduled) return
  annotationRenderScheduled = true
  window.requestAnimationFrame(() => {
    annotationRenderScheduled = false
    renderAnnotationHighlights()
  })
}

function isHighlightOnlyMutation(record) {
  const nodes = [
    ...Array.from(record.addedNodes || []),
    ...Array.from(record.removedNodes || []),
  ]
  return nodes.length > 0 && nodes.every((node) => (
    node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('altals-pdf-annotation-highlight')
  ))
}

function attachAnnotationMutationObserver() {
  annotationMutationObserver?.disconnect()
  annotationMutationObserver = null

  const viewerRoot = getViewerRoot()
  if (typeof MutationObserver !== 'function' || !viewerRoot) return

  annotationMutationObserver = new MutationObserver((records) => {
    if (records.every(isHighlightOnlyMutation)) return
    scheduleRenderAnnotationHighlights()
  })
  annotationMutationObserver.observe(viewerRoot, {
    childList: true,
    subtree: true,
  })
}

function handleIframeDoubleClick(event) {
  const pageElement = event.target?.closest?.('.page[data-page-number]')
  if (!pageElement) return

  const page = Number(pageElement.dataset.pageNumber || 0)
  const rect = pageElement.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top
  const syncTexPoint = convertPageOffsetToSyncTexPoint(page, localX, localY)
  emit('dblclick-page', {
    page,
    x: syncTexPoint?.x ?? localX,
    y: syncTexPoint?.y ?? localY,
  })
}

function scrollToPage(pageNumber) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return

  const app = getPdfApp()
  if (!app?.pdfLinkService?.goToPage) {
    pendingScrollLocation = { pageNumber: targetPage, x: null, y: null }
    return
  }

  app.pdfLinkService.goToPage(targetPage)
}

function applyPendingScrollLocation() {
  if (!pendingScrollLocation) return
  const nextLocation = pendingScrollLocation
  pendingScrollLocation = null
  scrollToLocation(nextLocation.pageNumber, nextLocation.x, nextLocation.y)
}

function scrollToLocation(pageNumber, x, y) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return

  const app = getPdfApp()
  const container = getPdfElement('viewerContainer')
  if (!app?.pdfViewer || !container) {
    pendingScrollLocation = { pageNumber: targetPage, x, y }
    scrollToPage(targetPage)
    return
  }

  pendingScrollLocation = null
  const pageOffset = convertSyncTexPointToPageOffset(targetPage, x, y)
  if (pageOffset?.pageElement) {
    const targetTop = pageOffset.pageElement.offsetTop + pageOffset.y - container.clientHeight / 2
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const clampedTop = Math.min(Math.max(0, targetTop), maxScrollTop)

    container.scrollTo({
      top: clampedTop,
      behavior: 'auto',
    })
    showSyncHighlight(targetPage, x, y)
  } else if (typeof app.pdfLinkService?.goToPage === 'function') {
    app.pdfLinkService.goToPage(targetPage)
  }
  syncPdfUi()
}

async function onIframeLoad() {
  const win = getPdfWindow()
  const app = getPdfApp()
  if (!win || !app) {
    rejectViewerReady?.(new Error('PDF viewer failed to initialize'))
    return
  }

  try {
    if (app.initializedPromise) {
      await app.initializedPromise
    }
  } catch (loadError) {
    rejectViewerReady?.(loadError)
    return
  }

  applyTheme()
  syncViewerAppZoom()
  clearIframePointerGuards()
  ensureEmbeddedSidebarShell()
  syncPdfUi()
  attachSidebarStateObserver()
  clearSyncTimer()
  clearSyncHighlight()
  syncTimer = window.setInterval(syncPdfUi, 250)

  if (!iframeListenersAttached) {
    try {
      const doc = win.document
      doc.addEventListener('click', handleViewerExternalLinkClick)
      doc.addEventListener('dblclick', handleIframeDoubleClick)
      doc.addEventListener('pointerdown', handleIframePointerDown, true)
      doc.addEventListener('mouseup', handleViewerMouseUp)
      doc.addEventListener('selectionchange', handleViewerSelectionChange)
      doc.addEventListener('contextmenu', handleViewerContextMenu)
      app.eventBus?._on?.('outlineloaded', () => {
        maybeResolveInitialSidebarViewPreference()
      })
      app.eventBus?._on?.('attachmentsloaded', () => {
        maybeResolveInitialSidebarViewPreference()
      })
      app.eventBus?._on?.('annotationeditormodechanged', () => {
        syncPdfUi()
      })
      doc.addEventListener('keydown', (event) => {
        handleViewerExternalLinkKeydown(event)
        if (event.defaultPrevented) {
          return
        }

        if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
          event.preventDefault()
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: event.key,
            code: event.code,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            bubbles: true,
            cancelable: true,
          }))
          return
        }

        if ((event.metaKey || event.ctrlKey) && String(event.key || '').toLowerCase() === 'f') {
          event.preventDefault()
          openSearch()
          return
        }

        if (event.key === 'Escape' && pdfContextMenu.show) {
          event.preventDefault()
          closePdfContextMenu()
          return
        }

        if (event.key === 'Escape' && pdfTranslationMenu.show) {
          event.preventDefault()
          closePdfTranslationMenu()
          return
        }

        if (event.key === 'Escape' && activeToolbarPanel.value) {
          event.preventDefault()
          activeToolbarPanel.value = ''
          return
        }

        if (event.key === 'Escape' && editorToolsExpanded.value) {
          event.preventDefault()
          editorToolsExpanded.value = false
          return
        }

        if (event.key === 'Escape' && (searchOpen.value || pdfUi.searchOpen)) {
          event.preventDefault()
          closeSearch()
        }
      })
      iframeListenersAttached = true
    } catch {}
  }

  attachAnnotationMutationObserver()
  scheduleRenderAnnotationHighlights()
  resolveViewerReady?.(app)
}

async function loadPdf() {
  const requestId = ++loadRequestId
  loading.value = true
  error.value = null
  clearSyncTimer()
  clearSyncHighlight()
  sidebarStateObserver?.disconnect()
  sidebarStateObserver = null
  resetPdfUi()
  clearPendingSelection({ clearDomSelection: true })
  clearRenderedAnnotationHighlights()
  annotationMutationObserver?.disconnect()
  annotationMutationObserver = null
  iframeListenersAttached = false

  try {
    const bytes = await invoke('read_file_binary', { path: filePathRef.value })
    if (requestId !== loadRequestId) return
    const uint8Array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    resetViewerReadyPromise()
    const params = new URLSearchParams({
      instance: String(requestId),
      locale: getPdfViewerLocaleParam(),
    })
    viewerSrc.value = `/pdfjs-viewer/web/viewer.html?${params.toString()}`
    const app = await viewerReadyPromise
    if (requestId !== loadRequestId) return
    await app.open({ data: uint8Array })
    if (requestId !== loadRequestId) {
      await app.close().catch(() => {})
      return
    }
    syncPdfUi()
    attachAnnotationMutationObserver()
    scheduleRenderAnnotationHighlights()
    applyPendingScrollLocation()
  } catch (loadError) {
    if (requestId !== loadRequestId) return
    error.value = loadError?.message || String(loadError)
  } finally {
    if (requestId === loadRequestId) {
      loading.value = false
    }
  }
}

function handlePdfUpdated(event) {
  if (event.detail?.path === filePathRef.value) loadPdf()
}

onMounted(() => {
  resetViewerReadyPromise()
  clearIframePointerGuards()
  window.addEventListener('pdf-updated', handlePdfUpdated)
  document.addEventListener('pointerdown', handleGlobalPointerDown, true)
  void pdfTranslateStore.ensureListeners().catch(() => {})
  void pdfTranslateStore.loadSettings().catch(() => {})
  void pdfTranslateStore.loadTasks().catch(() => {})
  loadPdf()
})

onUnmounted(() => {
  loadRequestId += 1
  annotationsSidebarTarget.value = null
  sidebarViewOverride = ''
  window.removeEventListener('pdf-updated', handlePdfUpdated)
  document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
  clearSyncTimer()
  clearSyncHighlight()
  sidebarStateObserver?.disconnect()
  sidebarStateObserver = null
  annotationMutationObserver?.disconnect()
  annotationMutationObserver = null
  clearRenderedAnnotationHighlights()
  clearPendingSelection({ clearDomSelection: true })
  const app = getPdfApp()
  if (app?.close) {
    app.close().catch(() => {})
  }
  viewerReadyPromise = null
  resolveViewerReady = null
  rejectViewerReady = null
})

watch(isDark, applyTheme)
watch(() => workspace.pdfThemedPages, applyTheme)
watch(() => workspace.appZoomPercent, () => {
  syncViewerAppZoom()
})

watch(
  () => [
    loading.value,
    pdfUi.pageNumber,
    pdfUi.scaleValue,
    currentPdfAnnotations.value.length,
    activeAnnotationId.value,
  ],
  () => {
    scheduleRenderAnnotationHighlights()
  },
)

watch(currentPdfAnnotations, () => {
  scheduleRenderAnnotationHighlights()
}, { deep: true })

watch(filePathRef, () => {
  loadPdf()
})

watch(() => locale.value, () => {
  loadPdf()
})

defineExpose({
  scrollToPage,
  scrollToLocation,
})
</script>

<style scoped>
.pdf-toolbar-wrap {
  flex: none;
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  overflow: visible;
}

.pdf-toolbar-wrap-embedded {
  border-bottom: 0;
  border-top: 0;
  position: relative;
  z-index: 4;
}

.pdf-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  min-height: var(--document-header-row-height, 24px);
  box-sizing: border-box;
  padding: 0 6px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
}

.pdf-toolbar::-webkit-scrollbar {
  display: none;
}

.pdf-toolbar-left,
.pdf-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  min-width: 0;
  flex: 1 1 0;
}

.pdf-toolbar-right {
  justify-content: flex-end;
}

.pdf-toolbar-center {
  position: absolute;
  inset: 0 auto 0 50%;
  display: flex;
  align-items: center;
  height: 100%;
  transform: translateX(-50%);
  pointer-events: none;
}

.pdf-toolbar-center > * {
  pointer-events: auto;
}

.pdf-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.pdf-toolbar-group-collapsible {
  gap: 4px;
}

.pdf-toolbar-collapsible-tools {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  max-width: 0;
  opacity: 0;
  transform: translateX(4px);
  pointer-events: none;
  transition: max-width 0.18s ease, opacity 0.14s ease, transform 0.18s ease;
}

.pdf-toolbar-group-collapsible-open .pdf-toolbar-collapsible-tools {
  max-width: 84px;
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.pdf-toolbar-separator {
  width: 1px;
  height: 12px;
  flex: none;
  background: color-mix(in srgb, var(--border) 85%, transparent);
}

.pdf-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  padding: 0;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.pdf-toolbar-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.pdf-toolbar-btn-active {
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.pdf-toolbar-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-toolbar-btn-sm {
  width: 18px;
  height: 18px;
}

.pdf-toolbar-input,
.pdf-toolbar-select {
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary));
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1;
  appearance: none;
}

.pdf-toolbar-input {
  padding: 0 8px;
}

.pdf-toolbar-search {
  width: 220px;
}

.pdf-toolbar-select {
  min-width: 120px;
  padding: 0 24px 0 8px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 11px) calc(50% - 1px), calc(100% - 7px) calc(50% - 1px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}

.pdf-page-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pdf-page-input {
  width: 36px;
  text-align: center;
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.pdf-toolbar-label,
.pdf-toolbar-hint {
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-toolbar-hint {
  color: var(--fg-muted);
  font-size: 11px;
}

.pdf-toolbar-group-translate {
  gap: 8px;
}

.pdf-toolbar-group-scale {
  gap: 6px;
}

.pdf-search-popover {
  position: absolute;
  top: calc(var(--document-header-row-height, 24px) + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 24;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: fit-content;
  min-width: 460px;
  max-width: min(560px, calc(100% - 12px));
  box-sizing: border-box;
  padding: 5px 6px;
  min-height: 0;
  border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 76%, transparent);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(16px) saturate(120%);
  -webkit-backdrop-filter: blur(16px) saturate(120%);
}

.pdf-search-popover-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.pdf-search-popover-row-main {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 18px;
  align-items: center;
  column-gap: 6px;
  width: 100%;
}

.pdf-search-popover-row-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
}

.pdf-search-popover-row-main .pdf-toolbar-search {
  width: 100%;
  min-width: 0;
}

.pdf-toolbar-popover {
  position: absolute;
  top: calc(var(--document-header-row-height, 24px) + 6px);
  z-index: 24;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 220px;
  max-width: min(280px, calc(100vw - 12px));
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary));
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10px);
}

.pdf-toolbar-popover-right,
.pdf-toolbar-popover-menu {
  right: 6px;
}

.pdf-toolbar-popover-menu {
  width: max-content;
  min-width: 220px;
  gap: 2px;
  padding: 6px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  scrollbar-width: none;
}

.pdf-toolbar-popover-menu::-webkit-scrollbar {
  display: none;
}

.pdf-toolbar-popover-title {
  color: var(--fg-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.pdf-toolbar-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pdf-toolbar-field input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
}

.pdf-color-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.pdf-color-swatch-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.pdf-color-swatch-btn:hover {
  background: var(--bg-hover);
}

.pdf-color-swatch-btn-active {
  border-color: color-mix(in srgb, var(--accent) 36%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.pdf-color-swatch {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
}

.pdf-color-input {
  width: 100%;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary));
}

.pdf-toolbar-menu-item {
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1.15;
  text-align: left;
  white-space: nowrap;
}

.pdf-toolbar-menu-item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.pdf-toolbar-menu-item:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-toolbar-menu-item-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.pdf-toolbar-menu-separator {
  width: 100%;
  height: 1px;
  margin: 4px 0;
  background: color-mix(in srgb, var(--border) 88%, transparent);
}

.pdf-search-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  width: 100%;
  min-width: 0;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-search-toggle:hover:not(:disabled) {
  background: var(--bg-hover);
}

.pdf-search-toggle:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-search-toggle-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.pdf-search-result-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  text-align: center;
  white-space: nowrap;
}

.pdf-annotation-btn,
.pdf-annotation-primary,
.pdf-annotation-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--ui-font-caption);
}

.pdf-annotation-btn,
.pdf-annotation-primary {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.pdf-annotation-btn:hover,
.pdf-annotation-primary:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pdf-context-menu-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
}

.pdf-context-menu-item:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-context-menu-item:disabled:hover {
  background: transparent !important;
  color: var(--fg-muted) !important;
}

.pdf-translate-context-menu {
  min-width: 240px;
}

.pdf-translate-menu-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px 5px;
}

.pdf-translate-menu-label {
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  font-weight: 600;
  line-height: 1.25;
}

.pdf-translate-menu-detail {
  color: var(--fg-muted);
  font-size: 11px;
  line-height: 1.3;
  word-break: break-word;
}

.pdf-annotation-sidebar-shell {
  display: flex;
  flex-direction: column;
  position: absolute;
  inset: 0 0 0 auto;
  width: min(360px, calc(100% - 40px));
  min-width: 280px;
  max-width: 420px;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary));
  box-shadow: -10px 0 28px rgba(0, 0, 0, 0.18);
  z-index: 12;
  backdrop-filter: blur(10px);
}

.pdf-annotation-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.pdf-annotation-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
  border: 1px dashed color-mix(in srgb, var(--border) 85%, transparent);
  color: var(--fg-muted);
  font-size: 12px;
}

.pdf-annotation-empty-hint {
  line-height: 1.4;
}

.pdf-annotation-pending {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.pdf-annotation-pending-label {
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}

.pdf-annotation-pending-quote,
.pdf-annotation-quote {
  color: var(--fg-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.pdf-annotation-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary));
  outline: none;
}

.pdf-annotation-item:hover {
  border-color: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pdf-annotation-item-active {
  border-color: color-mix(in srgb, var(--accent) 36%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent);
}

.pdf-annotation-item-header,
.pdf-annotation-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pdf-annotation-page,
.pdf-annotation-open {
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}

.pdf-annotation-date {
  color: var(--fg-muted);
  font-size: 11px;
}

.pdf-annotation-delete {
  color: var(--fg-muted);
  padding-inline: 8px;
}

.pdf-annotation-delete:hover {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 10%, transparent);
}

.pdf-annotation-note-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pdf-annotation-note-create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px dashed color-mix(in srgb, var(--accent) 28%, transparent);
  background: transparent;
  color: var(--accent);
  font-size: var(--ui-font-caption);
}

.pdf-annotation-note-create:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

@media (max-width: 880px) {
  .pdf-toolbar-center {
    position: static;
    transform: none;
    flex: none;
    inset: auto;
  }

  .pdf-toolbar {
    justify-content: flex-start;
    gap: 10px;
    flex-wrap: wrap;
  }

  .pdf-toolbar-left,
  .pdf-toolbar-right {
    flex: none;
  }

  .pdf-search-popover {
    left: 6px;
    right: 6px;
    transform: none;
    min-width: 0;
    width: auto;
    max-width: none;
  }

  .pdf-search-popover-row-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pdf-search-result-hint {
    grid-column: 1 / -1;
  }

  .pdf-annotation-sidebar-shell {
    width: min(100%, 420px);
    min-width: 0;
  }
}
</style>
