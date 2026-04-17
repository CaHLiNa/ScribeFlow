import { readFileSync, writeFileSync } from 'fs';
let panelContent = readFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', 'utf-8');

// There is a duplicated paperclip attach button from a bad regex replace. Let's fix that block.
panelContent = panelContent.replace(
  /<div class="ai-agent-panel__composer-actions">[\s\S]*?<\/div>\s*<\/footer>/,
  `<div class="ai-agent-panel__composer-actions">
          <div class="ai-agent-panel__composer-tools">
            <UiButton
              variant="ghost"
              size="sm"
              icon-only
              @click="attachFiles"
              :title="t('Attach files')"
            >
              <IconPaperclip :size="16" :stroke-width="1.5" />
            </UiButton>
            <UiSelect
              :model-value="aiStore.providerState.currentProviderId"
              size="sm"
              class="ai-agent-panel__provider-select-inline"
              shell-class="ai-agent-panel__provider-shell"
              :options="providerOptions"
              @update:model-value="switchProvider"
            />
          </div>

          <div class="ai-agent-panel__composer-primary">
            <button
              type="button"
              class="ai-agent-panel__send-button"
              :class="{ 'is-disabled': isSendBlocked }"
              :disabled="isSendBlocked"
              :title="sendButtonTitle"
              :aria-label="sendButtonTitle"
              @click.prevent.stop="handleSendClick"
            >
              <IconSquare v-if="aiStore.isGenerating" :size="12" fill="currentColor" />
              <IconArrowUp v-else :size="14" :stroke-width="2.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>`
);

writeFileSync('/Users/math173sr/Documents/GitHub项目/Altals/src/components/panel/AiAgentPanel.vue', panelContent);
