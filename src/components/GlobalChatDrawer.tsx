import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ChatMessage } from '../types/domain';
import {
  X,
  Send,
  MessageSquare,
  Bot,
  Flame,
  CornerDownRight,
  Sparkles,
  Paperclip,
  Smile,
  Hash,
  Gamepad2,
  Calendar,
  Check,
} from 'lucide-react';

export interface GlobalChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_REACTIONS = ['🔥', '😂', '💨', '🫡', '🎮'];

export const GlobalChatDrawer: React.FC<GlobalChatDrawerProps> = ({ isOpen, onClose }) => {
  const {
    chatMessages,
    sendChatMessage,
    toggleMessageReaction,
    players,
    currentUser,
    sessions,
    activeSessionId,
    discordConfig,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [forwardToDiscord, setForwardToDiscord] = useState(true);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [attachedSessionId, setAttachedSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages update or drawer opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isOpen]);

  // Focus textarea when replying
  useEffect(() => {
    if (replyingToMessage) {
      textareaRef.current?.focus();
    }
  }, [replyingToMessage]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Active session helper
  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === (attachedSessionId || activeSessionId));
  }, [sessions, attachedSessionId, activeSessionId]);

  if (!isOpen) return null;

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

  const handleKeyDownInTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const getKarmaColorClass = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30';
    if (score >= 50) return 'text-amber-400 bg-amber-950/60 border-amber-500/30';
    return 'text-rose-400 bg-rose-950/60 border-rose-500/30';
  };

  // Render text with highlighted @mentions
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@\w+|@todos|@everyone)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={idx}
            className="inline-block px-1.5 py-0.2 rounded font-semibold text-xs bg-indigo-500/25 text-indigo-300 border border-indigo-500/40"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Slide-over panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-lg bg-[#090d16] border-l border-indigo-900/60 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-indigo-950/80 bg-[#131c31]/90 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-300 shadow-md">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-white">
                    Chat Global de la Manada
                  </h2>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-[#5865F2] font-semibold">
                    <Bot className="w-3.5 h-3.5" />
                    #{discordConfig.channelName.replace('#', '') || 'boludos-gaming'}
                  </span>
                  <span>•</span>
                  <span>{players.length} amigos conectados</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Online friends bar */}
          <div className="px-4 py-2 bg-[#0c1220] border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs flex-shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex-shrink-0">
              Online:
            </span>
            <div className="flex items-center gap-1.5">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="relative group cursor-pointer"
                  onClick={() => insertMention(`@${p.displayName}`)}
                  title={`Mencionar a ${p.displayName} (${p.karmaScore}% Karma)`}
                >
                  <img
                    src={p.avatarUrl}
                    alt={p.displayName}
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-700 group-hover:ring-indigo-400 transition-all"
                  />
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-[#0c1220]" />
                </div>
              ))}
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#090d16]/60">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Smile className="w-10 h-10 text-slate-600 mb-2" />
                <p className="font-bold text-white text-sm">El chat está tranquilo</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Mandá un mensaje para coordinar la partida de hoy o arrobar a los pibes.
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
                    className={`flex flex-col space-y-1.5 text-xs group animate-in fade-in duration-150 ${
                      isMe ? 'items-end' : 'items-start'
                    }`}
                  >
                    {/* Replying quote if present */}
                    {repliedMsg && (
                      <div
                        className={`flex items-center gap-1.5 text-[11px] text-slate-400 pl-2 border-l-2 border-indigo-500/50 max-w-xs truncate ${
                          isMe ? 'self-end' : 'self-start'
                        }`}
                      >
                        <CornerDownRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-300">
                          @{repliedAuthor?.displayName || 'Alguien'}:
                        </span>
                        <span className="italic truncate">{repliedMsg.content}</span>
                      </div>
                    )}

                    <div className="flex items-start gap-2.5 max-w-[90%]">
                      {!isMe && (
                        <img
                          src={
                            author?.avatarUrl ||
                            'https://api.dicebear.com/7.x/bottts/svg?seed=friend'
                          }
                          alt={author?.displayName || 'Usuario'}
                          className="w-8 h-8 rounded-xl object-cover ring-1 ring-slate-700 flex-shrink-0 mt-0.5"
                        />
                      )}

                      <div>
                        {/* Author name & header */}
                        <div
                          className={`flex items-center gap-1.5 mb-1 ${
                            isMe ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <span className="font-bold text-white text-xs">
                            {isMe ? 'Vos' : author?.displayName || 'Amigo'}
                          </span>
                          {author && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getKarmaColorClass(
                                author.karmaScore
                              )}`}
                            >
                              {author.karmaScore}%
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {msg.createdAt
                              ? new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>

                          {msg.forwardedToDiscord && (
                            <span
                              className="text-[10px] text-[#5865F2] font-semibold flex items-center gap-0.5"
                              title="Reenviado al canal de Discord"
                            >
                              <Bot className="w-3 h-3" />
                            </span>
                          )}
                        </div>

                        {/* Bubble */}
                        <div
                          className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                            isMe
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-tr-none shadow-md shadow-indigo-600/20'
                              : 'bg-[#131c31] text-slate-200 border border-slate-800 rounded-tl-none shadow-md'
                          }`}
                        >
                          {renderMessageContent(msg.content)}

                          {/* Linked session mini card */}
                          {linkedSession && (
                            <div className="mt-2.5 p-2 rounded-xl bg-black/40 border border-indigo-400/30 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Gamepad2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <div>
                                  <span className="font-bold text-xs text-white block truncate max-w-[170px]">
                                    {linkedSession.title}
                                  </span>
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {linkedSession.date} • {linkedSession.status.toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200">
                                Sesión
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Reactions Row & Actions */}
                        <div
                          className={`flex items-center gap-1 mt-1.5 flex-wrap ${
                            isMe ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {/* Existing reaction badges */}
                          {msg.reactions &&
                            msg.reactions.map((r, rIdx) => {
                              const hasReacted = r.userIds.includes(currentUser.id);
                              return (
                                <button
                                  key={rIdx}
                                  type="button"
                                  onClick={() => toggleMessageReaction(msg.id, r.emoji)}
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all ${
                                    hasReacted
                                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                                      : 'bg-[#131c31] border-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  <span>{r.emoji}</span>
                                  <span className="text-[10px]">{r.userIds.length}</span>
                                </button>
                              );
                            })}

                          {/* Quick Emoji Picker Buttons on hover */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-[#090d16] p-0.5 rounded-full border border-slate-800">
                            {COMMON_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleMessageReaction(msg.id, emoji)}
                                className="w-6 h-6 flex items-center justify-center hover:scale-125 transition-transform text-xs"
                                title={`Reaccionar con ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setReplyingToMessage(msg)}
                              className="px-1.5 text-[10px] font-semibold text-slate-400 hover:text-white"
                              title="Responder"
                            >
                              Responder
                            </button>
                          </div>
                        </div>
                      </div>

                      {isMe && (
                        <img
                          src={currentUser.avatarUrl}
                          alt={currentUser.displayName}
                          className="w-8 h-8 rounded-xl object-cover ring-1 ring-indigo-500/40 flex-shrink-0 mt-0.5"
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Mention Pills Bar */}
          <div className="px-4 py-2 bg-[#0c1220] border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-xs flex-shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
              Mencionar:
            </span>
            <button
              type="button"
              onClick={() => insertMention('@todos')}
              className="px-2 py-0.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-bold border border-indigo-500/40 flex-shrink-0"
            >
              @todos
            </button>
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => insertMention(`@${p.displayName}`)}
                className="px-2 py-0.5 rounded-lg bg-[#131c31] hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] font-medium border border-slate-800 flex-shrink-0"
              >
                @{p.displayName}
              </button>
            ))}
          </div>

          {/* Active Reply Banner */}
          {replyingToMessage && (
            <div className="px-4 py-2 bg-indigo-950/60 border-t border-indigo-900/60 flex items-center justify-between text-xs text-indigo-200 flex-shrink-0">
              <div className="flex items-center gap-2 truncate">
                <CornerDownRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span className="truncate">
                  Respondiendo a{' '}
                  <strong className="text-white">
                    {players.find((p) => p.id === replyingToMessage.userId)?.displayName || 'Amigo'}
                  </strong>
                  : &ldquo;{replyingToMessage.content}&rdquo;
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingToMessage(null)}
                className="text-xs text-slate-400 hover:text-white ml-2 flex-shrink-0"
              >
                ✕ Cancelar
              </button>
            </div>
          )}

          {/* Controls Bar: Attach session & Discord forward checkbox */}
          <div className="px-4 py-2 bg-[#131c31] border-t border-slate-800 flex items-center justify-between text-xs text-slate-300 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={forwardToDiscord}
                onChange={(e) => setForwardToDiscord(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-700 text-[#5865F2] focus:ring-0"
              />
              <span className="flex items-center gap-1 text-[11px]">
                <Bot className="w-3.5 h-3.5 text-[#5865F2]" />
                <span>Reenviar a Discord</span>
              </span>
            </label>

            {/* Session attach button */}
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (attachedSessionId) {
                    setAttachedSessionId(null);
                  } else {
                    setAttachedSessionId(activeSessionId || sessions[0]?.id || null);
                  }
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  attachedSessionId
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white border-slate-700'
                }`}
                title="Adjuntar tarjeta de la sesión actual al mensaje"
              >
                <Paperclip className="w-3 h-3" />
                <span>{attachedSessionId ? 'Sesión Adjunta ✓' : 'Adjuntar Sesión'}</span>
              </button>
            )}
          </div>

          {/* Input Box Footer */}
          <div className="p-4 bg-[#0c1220] border-t border-slate-800/80 flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDownInTextarea}
                placeholder="Escribí un mensaje... (Enter para enviar, Shift+Enter para salto de línea)"
                className="flex-1 px-3.5 py-2.5 rounded-2xl bg-[#090d16] border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
              />

              <button
                type="submit"
                disabled={!inputText.trim()}
                className="w-11 h-11 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                title="Enviar mensaje"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
