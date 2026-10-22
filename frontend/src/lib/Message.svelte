<script lang="ts">
  import type { Message } from './types';
  import { marked } from 'marked';
  import { Bot, User, ChevronDown, ChevronRight, Terminal, Check, Copy } from 'lucide-svelte';

  interface Props {
    message: Message;
  }

  let { message }: Props = $props();

  let showThought = $state(false);
  let copied = $state(false);

  let renderedHtml = $derived(
    message.content ? marked.parse(message.content, { async: false }) : ''
  );

  async function copyContent() {
    if (!message.content) return;
    await navigator.clipboard.writeText(message.content);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }
</script>

<div class="flex gap-4 py-4 px-2 sm:px-6 w-full max-w-4xl mx-auto transition-colors {message.role === 'user' ? 'justify-end' : 'justify-start'}">
  {#if message.role !== 'user'}
    <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 text-white mt-1">
      <Bot size={18} />
    </div>
  {/if}

  <div class="flex flex-col gap-2 max-w-[85%] sm:max-w-[78%]">
    <!-- Header / Role Label -->
    <div class="flex items-center gap-2 text-xs text-slate-400">
      <span class="font-medium {message.role === 'user' ? 'text-blue-400' : 'text-indigo-400'}">
        {message.role === 'user' ? 'You' : 'Antigravity'}
      </span>
      {#if message.usage?.duration_seconds}
        <span>•</span>
        <span>{message.usage.duration_seconds.toFixed(1)}s</span>
      {/if}
      {#if message.usage?.total_tokens}
        <span>•</span>
        <span>{message.usage.total_tokens} tokens</span>
      {/if}
    </div>

    <!-- Collapsible Reasoning / Thought block -->
    {#if message.thought}
      <div class="border border-slate-700/60 bg-slate-900/60 rounded-lg p-2.5 text-xs text-slate-300">
        <button
          type="button"
          onclick={() => showThought = !showThought}
          class="flex items-center gap-1.5 font-medium text-slate-400 hover:text-slate-200 transition-colors w-full text-left"
        >
          {#if showThought}
            <ChevronDown size={14} />
          {:else}
            <ChevronRight size={14} />
          {/if}
          <span>Thought Process ({message.thought.length} chars)</span>
        </button>
        {#if showThought}
          <div class="mt-2 text-slate-400 whitespace-pre-wrap font-mono text-[11px] max-h-60 overflow-y-auto border-t border-slate-800 pt-2">
            {message.thought}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Tool Calls badges -->
    {#if message.toolCalls && message.toolCalls.length > 0}
      <div class="flex flex-wrap gap-1.5 my-1">
        {#each message.toolCalls as tool}
          <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-mono">
            <Terminal size={12} />
            <span>{tool.name}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Main Message Bubble -->
    <div class="relative group rounded-2xl p-4 text-sm leading-relaxed shadow-sm {
      message.role === 'user'
        ? 'bg-blue-600 text-white rounded-tr-none'
        : 'bg-[#181c28] border border-slate-800 text-slate-100 rounded-tl-none'
    }">
      {#if message.role === 'user'}
        <p class="whitespace-pre-wrap">{message.content}</p>
      {:else}
        {#if message.content}
          <div class="prose max-w-none">
            {@html renderedHtml}
          </div>
        {:else if message.isStreaming}
          <span class="inline-flex items-center gap-1.5 text-slate-400 italic text-xs">
            <span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
            Generating response...
          </span>
        {/if}

        {#if message.isStreaming && message.content}
          <span class="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse align-middle"></span>
        {/if}

        <!-- Copy button -->
        {#if message.content && !message.isStreaming}
          <button
            type="button"
            onclick={copyContent}
            class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
            title="Copy message"
          >
            {#if copied}
              <Check size={14} class="text-green-400" />
            {:else}
              <Copy size={14} />
            {/if}
          </button>
        {/if}
      {/if}
    </div>
  </div>

  {#if message.role === 'user'}
    <div class="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 text-white shadow-md mt-1">
      <User size={18} />
    </div>
  {/if}
</div>
