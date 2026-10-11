import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { DirectConversation, DirectMessage, DirectMessageReport } from '../../core/models/models';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
})
export class MessagesComponent implements OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private inboxChannel: ReturnType<typeof this.supabase.client.channel> | null = null;
  private messageChannel: ReturnType<typeof this.supabase.client.channel> | null = null;
  private handledRequestedConversation = false;

  readonly conversations = signal<DirectConversation[]>([]);
  readonly messages = signal<DirectMessage[]>([]);
  readonly hasOlderMessages = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly draft = signal('');
  readonly reportReason = signal<DirectMessageReport['reason']>('spam');
  readonly reportDetails = signal('');
  readonly loading = signal(true);
  readonly loadingMessages = signal(false);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly reportOpen = signal(false);

  constructor() {
    void this.loadInbox();
    const profileId = this.supabase.profile()?.id;
    if (profileId) {
      this.inboxChannel = this.supabase.client.channel(`direct-inbox-${profileId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'direct_conversations', filter: `requester_id=eq.${profileId}`,
        }, () => void this.loadInbox())
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'direct_conversations', filter: `recipient_id=eq.${profileId}`,
        }, () => void this.loadInbox())
        .subscribe();
    }
  }

  ngOnDestroy() {
    if (this.inboxChannel) void this.supabase.client.removeChannel(this.inboxChannel);
    if (this.messageChannel) void this.supabase.client.removeChannel(this.messageChannel);
  }

  get incomingRequests() {
    const profileId = this.supabase.profile()?.id;
    return this.conversations().filter((item) => item.status === 'pending' && item.recipient_id === profileId);
  }

  get outgoingRequests() {
    const profileId = this.supabase.profile()?.id;
    return this.conversations().filter((item) => item.status === 'pending' && item.requester_id === profileId);
  }

  get acceptedConversations() {
    return this.conversations().filter((item) => item.status === 'accepted');
  }

  get selectedConversation() {
    return this.conversations().find((item) => item.id === this.selectedId()) ?? null;
  }

  get currentProfileId() {
    return this.supabase.profile()?.id ?? '';
  }

  async loadInbox() {
    this.error.set(null);
    const { data, error } = await this.supabase.client.rpc('my_direct_conversations');
    this.loading.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.conversations.set((data ?? []) as DirectConversation[]);
    const requestedId = this.route.snapshot.queryParamMap.get('conversation');
    if (!this.handledRequestedConversation && requestedId) {
      this.handledRequestedConversation = true;
      const requested = this.conversations().find((item) => item.id === requestedId);
      if (requested) void this.openConversation(requested);
    }
    if (this.selectedId() && !this.conversations().some((item) => item.id === this.selectedId())) {
      this.selectedId.set(null);
      this.messages.set([]);
      this.stopMessageSubscription();
    }
  }

  async openConversation(conversation: DirectConversation) {
    this.selectedId.set(conversation.id);
    this.status.set(null);
    this.error.set(null);
    this.draft.set('');
    this.reportOpen.set(false);
    this.messages.set([]);
    this.hasOlderMessages.set(false);
    this.stopMessageSubscription();
    if (conversation.status !== 'accepted' || conversation.blocked_by_me || conversation.blocked_by_them) return;

    this.messageChannel = this.supabase.client.channel(`direct-thread-${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversation.id}`,
      }, () => {
        void this.loadMessages();
        void this.loadInbox();
      })
      .subscribe();
    await this.loadMessages();
  }

  private stopMessageSubscription() {
    if (this.messageChannel) void this.supabase.client.removeChannel(this.messageChannel);
    this.messageChannel = null;
  }

  async loadMessages() {
    const conversation = this.selectedConversation;
    if (!conversation || conversation.status !== 'accepted') return;
    this.loadingMessages.set(true);
    const { data, error } = await this.supabase.client.from('direct_messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(51);
    this.loadingMessages.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    if (this.selectedId() !== conversation.id) return;
    const rows = (data ?? []) as DirectMessage[];
    this.hasOlderMessages.set(rows.length > 50);
    this.messages.set(rows.slice(0, 50).reverse());
    await this.supabase.client.rpc('mark_direct_conversation_read', { target_conversation: conversation.id });
    await this.loadInbox();
  }

  async loadOlderMessages() {
    const conversation = this.selectedConversation;
    const currentMessages = this.messages();
    if (!conversation || !currentMessages.length || !this.hasOlderMessages() || this.loadingMessages()) return;
    this.loadingMessages.set(true);
    const { data, error } = await this.supabase.client.from('direct_messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', conversation.id)
      .lt('created_at', currentMessages[0].created_at)
      .order('created_at', { ascending: false })
      .limit(51);
    this.loadingMessages.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    if (this.selectedId() !== conversation.id) return;
    const rows = (data ?? []) as DirectMessage[];
    this.hasOlderMessages.set(rows.length > 50);
    this.messages.set([...rows.slice(0, 50).reverse(), ...this.messages()]);
  }

  backToInbox() {
    this.selectedId.set(null);
    this.messages.set([]);
    this.stopMessageSubscription();
  }

  async sendMessage() {
    const conversation = this.selectedConversation;
    const body = this.draft().trim();
    if (!conversation || conversation.status !== 'accepted' || !body || body.length > 2000 || this.sending()) return;
    this.error.set(null);
    this.sending.set(true);
    const { error } = await this.supabase.client.from('direct_messages').insert({
      conversation_id: conversation.id,
      sender_id: this.currentProfileId,
      body,
    });
    this.sending.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.draft.set('');
    await this.loadMessages();
  }

  async respondToRequest(conversation: DirectConversation, acceptRequest: boolean) {
    this.error.set(null);
    const { error } = await this.supabase.client.rpc('respond_direct_message_request', {
      target_conversation: conversation.id,
      accept_request: acceptRequest,
    });
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.status.set(acceptRequest ? 'Request accepted. You can now chat.' : 'Request declined.');
    await this.loadInbox();
    if (acceptRequest) {
      const accepted = this.conversations().find((item) => item.id === conversation.id);
      if (accepted) await this.openConversation(accepted);
    } else if (this.selectedId() === conversation.id) {
      this.selectedId.set(null);
    }
  }

  async cancelRequest(conversation: DirectConversation) {
    this.error.set(null);
    const { error } = await this.supabase.client.rpc('cancel_direct_message_request', {
      target_conversation: conversation.id,
    });
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.status.set('Request cancelled.');
    this.selectedId.set(null);
    await this.loadInbox();
  }

  async toggleBlock(conversation: DirectConversation) {
    const shouldBlock = !conversation.blocked_by_me;
    this.error.set(null);
    const { error } = await this.supabase.client.rpc('set_direct_message_block', {
      target_conversation: conversation.id,
      should_block: shouldBlock,
    });
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.status.set(shouldBlock ? 'Member blocked. Messages are disabled.' : 'Member unblocked.');
    await this.loadInbox();
  }

  async reportConversation(conversation: DirectConversation) {
    this.error.set(null);
    const { error } = await this.supabase.client.from('direct_message_reports').insert({
      conversation_id: conversation.id,
      reporter_id: this.currentProfileId,
      reason: this.reportReason(),
      details: this.reportDetails().trim() || null,
    });
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.reportOpen.set(false);
    this.reportDetails.set('');
    this.status.set('Report sent to your community administrators.');
  }

  messageTime(value: string) {
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }
}
