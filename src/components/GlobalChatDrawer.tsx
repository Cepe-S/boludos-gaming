import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { ChatMessage } from '@/types/domain';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Bot,
  Calendar,
  CornerDownRight,
  Gamepad2,
  MessageSquare,
  Paperclip,
  Send,
  Smile,
  X,
} from 'lucide-react';

interface GlobalChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_REACTIONS = ['🔥', '😂', '💀', '🍻', '🫡'];

export const GlobalChatDrawer: React.FC<GlobalChatDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    chatMessages,
    sendChatMessage,
    toggleMessageReaction,
    currentUser,
    players,
    sessions,
    activeSessionId,
    discordConfig,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [replyingToMessage, setReplyingToMessage] =
    useState<ChatMessage | null>(null);
  const [attachedSessionId, setAttachedSessionId] = useState<string | null>(
    null
  );
  const [forwardToDiscord, setForwardToDiscord] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, chatMessages.length]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    sendChatMessage({
      content: trimmed,
      replyToId: replyingToMessage?.id,
      linkedSessionId: attachedSessionId || undefined,
      forwardToDiscord,
    });

    setInputText('');
    setReplyingToMessage(null);
    setAttachedSessionId(null);
  };

  // IME-safe Enter handling per Modern Web Guidance
  const handleKeyDownInTextarea = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const insertMention = (mentionText: string) => {
    setInputText((prev) => {
      const space = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
      return `${prev}${space}${mentionText} `;
    });
    textareaRef.current?.focus();
  };

  const getKarmaBadgeVariant = (score: number): 'success' | 'warning' | 'destructive' => {
    if (score >= 80) return 'success';
    if (score >= 50) return 'warning';
    return 'destructive';
  };

  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@\w+|@todos|@everyone)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={idx}
            className="inline-block px-1 py-0 rounded font-semibold text-xs bg-primary/25 text-primary border border-primary/40"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col bg-card/65 backdrop-blur-xl border-l border-white/12 gap-0"
      >
        <SheetHeader className="p-4 border-b border-border/70 bg-card/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 pr-8">
            <div className="w-9 h-9 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle>Chat Global</SheetTitle>
                <span className="inline-block w-2 h-2 rounded-full bg-success" />
              </div>
              <SheetDescription className="flex items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 text-primary font-medium">
                  <Bot className="w-3 h-3" strokeWidth={1.75} />#
                  {discordConfig.channelName.replace('#', '') ||
                    'boludos-gaming'}
                </span>
                <span>·</span>
                <span>{players.length}</span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Quick online avatars mention bar */}
        <div className="px-4 py-2 bg-background/40 border-b border-border/70 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              className="relative group cursor-pointer shrink-0"
              onClick={() => insertMention(`@${p.displayName}`)}
              title={`@${p.displayName} (${p.karmaScore}%)`}
              aria-label={`Mencionar a ${p.displayName}`}
            >
              <img
                src={p.avatarUrl}
                alt={p.displayName}
                className="w-7 h-7 rounded-full object-cover border border-border group-hover:border-primary transition-colors"
              />
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success ring-1 ring-background" />
            </button>
          ))}
        </div>

        {/* Message List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-background/25">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <Smile className="w-7 h-7 mb-2 opacity-60" strokeWidth={1.75} />
              <p className="font-medium text-foreground text-xs">
                Sin mensajes
              </p>
            </div>
          ) : (
            chatMessages.map((msg) => {
              const author = players.find((p) => p.id === msg.userId);
              const isMe = msg.userId === currentUser.id;
              const repliedMsg = msg.replyToId
                ? chatMessages.find((m) => m.id === msg.replyToId)
                : null;
              const repliedAuthor = repliedMsg
                ? players.find((p) => p.id === repliedMsg.userId)
                : null;
              const linkedSession = msg.linkedSessionId
                ? sessions.find((s) => s.id === msg.linkedSessionId)
                : null;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex flex-col space-y-1 text-xs group',
                    isMe ? 'items-end' : 'items-start'
                  )}
                >
                  {repliedMsg && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-2 border-l-2 border-primary/50 max-w-xs truncate">
                      <CornerDownRight
                        className="w-3 h-3 text-primary shrink-0"
                        strokeWidth={1.75}
                      />
                      <span className="font-medium text-foreground">
                        @{repliedAuthor?.displayName || 'Amigo'}:
                      </span>
                      <span className="italic truncate">{repliedMsg.content}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2 max-w-[90%]">
                    {!isMe && (
                      <img
                        src={
                          author?.avatarUrl ||
                          'https://api.dicebear.com/7.x/bottts/svg?seed=friend'
                        }
                        alt={author?.displayName || 'Usuario'}
                        className="w-7 h-7 rounded-full object-cover border border-border shrink-0 mt-0.5"
                      />
                    )}

                    <div className="space-y-1 min-w-0">
                      <div
                        className={cn(
                          'flex items-center gap-1.5',
                          isMe ? 'justify-end' : 'justify-start'
                        )}
                      >
                        <span className="font-semibold text-foreground text-xs">
                          {isMe ? 'Vos' : author?.displayName || 'Amigo'}
                        </span>
                        {author && (
                          <Badge
                            variant={getKarmaBadgeVariant(author.karmaScore)}
                            className="text-[9px] px-1 py-0 font-mono"
                          >
                            {author.karmaScore}K
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {msg.createdAt
                            ? new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                        {msg.forwardedToDiscord && (
                          <span title="Espejado en Discord" className="inline-flex">
                            <Bot className="w-3 h-3 text-primary" strokeWidth={1.75} />
                          </span>
                        )}
                      </div>

                      <div
                        className={cn(
                          'p-2.5 rounded-md text-xs leading-relaxed border',
                          isMe
                            ? 'bg-primary/20 border-primary/40 text-foreground'
                            : 'bg-card/65 backdrop-blur-xs border-border/80 text-foreground'
                        )}
                      >
                        {renderMessageContent(msg.content)}

                        {linkedSession && (
                          <div className="mt-2 p-2 rounded bg-background border border-border flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Gamepad2
                                className="w-3.5 h-3.5 text-warning shrink-0"
                                strokeWidth={1.75}
                              />
                              <div className="min-w-0">
                                <span className="font-semibold text-[11px] text-foreground block truncate max-w-[160px]">
                                  {linkedSession.title}
                                </span>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-2.5 h-2.5" strokeWidth={1.75} />
                                  {linkedSession.date}
                                </span>
                              </div>
                            </div>
                            <Badge variant="default" className="text-[9px]">
                              Sesión
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Reactions */}
                      <div
                        className={cn(
                          'flex items-center gap-1 flex-wrap',
                          isMe ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {msg.reactions?.map((r, rIdx) => {
                          const hasReacted = r.userIds.includes(currentUser.id);
                          return (
                            <button
                              key={rIdx}
                              type="button"
                              onClick={() => toggleMessageReaction(msg.id, r.emoji)}
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium cursor-pointer transition-colors',
                                hasReacted
                                  ? 'bg-primary/20 border-primary/50 text-primary'
                                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
                              )}
                            >
                              <span>{r.emoji}</span>
                              <span className="text-[10px] font-mono">
                                {r.userIds.length}
                              </span>
                            </button>
                          );
                        })}

                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-card px-1 py-0.5 rounded border border-border">
                          {COMMON_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => toggleMessageReaction(msg.id, emoji)}
                              title={`Reaccionar ${emoji}`}
                              aria-label={`Reaccionar ${emoji}`}
                              className="w-5 h-5 flex items-center justify-center hover:scale-110 transition-transform text-xs cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setReplyingToMessage(msg)}
                            title="Responder"
                            aria-label="Responder"
                            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <CornerDownRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {isMe && (
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.displayName}
                        className="w-7 h-7 rounded-full object-cover border border-primary/50 shrink-0 mt-0.5"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Mention Pills Bar */}
        <div className="px-4 py-1.5 bg-card/45 border-t border-border/70 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => insertMention('@todos')}
            className="px-2 py-0.5 rounded bg-primary/15 border border-primary/40 text-primary text-[10px] font-semibold shrink-0 cursor-pointer"
          >
            @todos
          </button>
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => insertMention(`@${p.displayName}`)}
              className="px-2 py-0.5 rounded bg-background border border-border text-muted-foreground hover:text-foreground text-[10px] shrink-0 cursor-pointer"
            >
              @{p.displayName}
            </button>
          ))}
        </div>

        {/* Reply Preview */}
        {replyingToMessage && (
          <div className="px-4 py-1.5 bg-secondary border-t border-border flex items-center justify-between text-xs shrink-0">
            <span className="truncate text-muted-foreground">
              <strong className="text-foreground">
                @{players.find((p) => p.id === replyingToMessage.userId)
                  ?.displayName || 'Amigo'}
              </strong>
              : &ldquo;{replyingToMessage.content}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => setReplyingToMessage(null)}
              title="Cancelar respuesta"
              aria-label="Cancelar respuesta"
              className="p-1 text-muted-foreground hover:text-foreground ml-2 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Controls Bar */}
        <div className="px-4 py-1.5 bg-card/55 border-t border-border/70 flex items-center justify-between gap-2 text-xs shrink-0">
          <Button
            type="button"
            size="icon"
            variant={forwardToDiscord ? 'secondary' : 'ghost'}
            onClick={() => setForwardToDiscord((prev) => !prev)}
            title={forwardToDiscord ? 'Reenviar a Discord: ON' : 'Reenviar a Discord: OFF'}
            aria-label="Reenviar a Discord"
            aria-pressed={forwardToDiscord}
            className={cn(
              'h-7 w-7',
              forwardToDiscord
                ? 'border border-primary/60 bg-primary/15 text-primary'
                : 'text-muted-foreground'
            )}
          >
            <Bot className="w-4 h-4" strokeWidth={1.75} />
          </Button>

          {sessions.length > 0 && (
            <Button
              type="button"
              size="icon"
              variant={attachedSessionId ? 'amber' : 'outline'}
              onClick={() =>
                setAttachedSessionId(
                  attachedSessionId
                    ? null
                    : activeSessionId || sessions[0]?.id || null
                )
              }
              title={attachedSessionId ? 'Quitar sesión adjunta' : 'Adjuntar sesión activa'}
              aria-label={attachedSessionId ? 'Quitar sesión adjunta' : 'Adjuntar sesión activa'}
              aria-pressed={Boolean(attachedSessionId)}
              className="h-7 w-7"
            >
              <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>

        {/* Message Composer */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 bg-background/50 backdrop-blur-md border-t border-border/70 flex items-end gap-2 shrink-0"
        >
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDownInTextarea}
            placeholder="Mensaje..."
            className="flex-1 px-3 py-2 rounded-md bg-card/60 border border-border text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputText.trim()}
            title="Enviar mensaje"
            aria-label="Enviar mensaje"
            className="h-10 w-10 shrink-0"
          >
            <Send className="w-4 h-4" strokeWidth={1.75} />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};
