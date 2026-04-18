const fs = require('fs');
let content = fs.readFileSync('src/components/panel/AiAgentPanel.vue', 'utf8');

const oldHeaderStr = `<div
      ref="threadRef"`;

const newHeaderStr = `<header class="ai-agent-panel__header">
      <div class="ai-agent-panel__session-control">
        <AiSessionRail
          :sessions="sessionItems"
          :current-session-id="aiStore.currentSessionId"
          @create="createSession"
          @switch="switchSessionTab"
          @rename="renameSession"
          @delete="deleteSession"
        />
      </div>

      <UiSelect
        :model-value="aiStore.providerState.currentProviderId"
        size="sm"
        class="ai-agent-panel__provider-select-inline"
        shell-class="ai-agent-panel__provider-shell"
        :options="providerOptions"
        @update:model-value="switchProvider"
      />
    </header>

    <div
      ref="threadRef"`;

content = content.replace(oldHeaderStr, newHeaderStr);

const oldControlStr = `        <AiAttachmentList :attachments="attachments" @remove="removeAttachment" />

        <div class="ai-agent-panel__control-bar">
          <div class="ai-agent-panel__session-control">
          <AiSessionRail
            :sessions="sessionItems"
            :current-session-id="aiStore.currentSessionId"
            @create="createSession"
            @switch="switchSessionTab"
            @rename="renameSession"
            @delete="deleteSession"
          />
          </div>

          <UiSelect
            :model-value="aiStore.providerState.currentProviderId"
            size="sm"
            class="ai-agent-panel__provider-select-inline"
            shell-class="ai-agent-panel__provider-shell"
            :options="providerOptions"
            @update:model-value="switchProvider"
          />
        </div>

        <div class="ai-agent-panel__composer-well">`;

const newControlStr = `        <AiAttachmentList :attachments="attachments" @remove="removeAttachment" />

        <div class="ai-agent-panel__composer-well">`;

content = content.replace(oldControlStr, newControlStr);

fs.writeFileSync('src/components/panel/AiAgentPanel.vue', content);
