'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Sparkles, Brain, AlertCircle, MessageCircle, Zap, ChevronDown, Paperclip, Mic, MicOff, Square, FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import { useBrandStore } from '@/stores/brand'
import { chatWithDirector, DirectorResponse } from '@/actions/director'
import { useToast } from './Toast'

interface Attachment {
  id: string
  name: string
  type: 'image' | 'document'
  url: string // base64 data URL
  mimeType: string
}

interface ChatMessage {
  role: 'user' | 'ai'
  content: string
  actionTaken?: string
  attachments?: Attachment[]
  isVoice?: boolean
}

export function CreativeDirectorChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [category, setCategory] = useState<'bad_output' | 'new_info' | 'suggestion'>('suggestion')
  const [isTyping, setIsTyping] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', content: "Blanc Mode activated. I've reviewed everything your AI has been putting out for this brand. If the output sucks, tell me exactly what's wrong - I'll diagnose, rewrite, and permanently fix the machine. If you've got insider intel about the brand that the AI is missing, drop it. You can also send me images, voice notes, or reference files. Let's get to work." }
  ])
  
  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Voice Recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { brands, activeBrandId, addPendingInsight } = useBrandStore()
  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const { showToast } = useToast()

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  if (!activeBrand) return null

  // ── File Attachment Handler ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (let i = 0; i < Math.min(files.length, 3); i++) {
      const file = files[i]
      const isImage = file.type.startsWith('image/')
      
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      setAttachments(prev => [...prev.slice(0, 2), {
        id: `${Date.now()}-${i}`,
        name: file.name,
        type: isImage ? 'image' : 'document',
        url,
        mimeType: file.type,
      }])
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  // ── Voice Recording ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Set up audio analyser for visual feedback
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        audioCtx.close()
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          await transcribeAndSend(audioBlob)
        }
      }
      
      mediaRecorder.start(100)
      setIsRecording(true)
      setRecordingTime(0)
      
      // Timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
      // Audio level meter
      const updateLevel = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(avg / 255)
        animFrameRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()
      
    } catch (err) {
      showToast('Microphone access denied', 'error')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      setAudioLevel(0)
    }
  }

  const transcribeAndSend = async (audioBlob: Blob) => {
    setIsTyping(true)
    
    try {
      // Use Web Speech API for transcription (free, client-side)
      const transcript = await new Promise<string>((resolve, reject) => {
        // Try Whisper-style server transcription first
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            const base64Audio = (reader.result as string).split(',')[1]
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64Audio }),
            })
            if (res.ok) {
              const data = await res.json()
              resolve(data.text)
            } else {
              // Fallback: use the SpeechRecognition API note
              resolve('[Voice note attached - transcription unavailable. Processing audio context...]')
            }
          } catch {
            resolve('[Voice note attached - transcription unavailable. Processing audio context...]')
          }
        }
        reader.readAsDataURL(audioBlob)
      })
      
      // Send as a voice message
      const userMsg = transcript
      setMessages(prev => [...prev, { role: 'user', content: userMsg, isVoice: true }])
      
      await sendToDirector(userMsg, [])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', content: "Couldn't process your voice note. Try typing it out." }])
      setIsTyping(false)
    }
  }

  // ── Send Message ──
  const sendToDirector = async (userMsg: string, currentAttachments: Attachment[]) => {
    setIsTyping(true)
    
    try {
      // Build enhanced message with attachment context
      let enhancedMsg = userMsg
      if (currentAttachments.length > 0) {
        const attachDescriptions = currentAttachments.map(a => {
          if (a.type === 'image') return `[Attached image: ${a.name}]`
          return `[Attached document: ${a.name}]`
        }).join(' ')
        enhancedMsg = `${userMsg}\n\n${attachDescriptions}`
      }
      
      const res = await chatWithDirector(
        activeBrand!.brandInfo!, 
        enhancedMsg, 
        category,
        activeBrand!.strategy,
        activeBrand!.calendar?.slice(-10),
        activeBrand!.contentDrafts
      )
      
      if (res.success && res.data) {
        setMessages(prev => [...prev, { 
          role: 'ai', 
          content: res.data!.message,
          actionTaken: res.data!.actionTaken
        }])
        
        if (res.data.proposedInsight && res.data.proposedInsight !== 'null') {
          addPendingInsight(res.data.proposedInsight)
          showToast("New rule staged in Training Buffer. Approve it in Brand OS.", "success")
        }
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: "Connection dropped. Even legends have bad wifi. Try again." }])
      }
    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, { role: 'ai', content: "Something broke on my end. Hit me again." }])
    } finally {
      setIsTyping(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && attachments.length === 0) || isTyping) return

    const userMsg = input.trim() || 'Check these attachments.'
    const currentAttachments = [...attachments]
    
    setInput('')
    setAttachments([])
    setMessages(prev => [...prev, { role: 'user', content: userMsg, attachments: currentAttachments.length > 0 ? currentAttachments : undefined }])

    await sendToDirector(userMsg, currentAttachments)
  }

  const messageCount = messages.filter(m => m.role === 'user').length
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="fixed bottom-8 right-8 z-[200]">
      {/* Floating Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-full shadow-[0_8px_32px_rgba(251,146,60,0.4)] flex items-center justify-center transition-all hover:scale-110 active:scale-95 group relative"
        >
          <Zap className="w-7 h-7 fill-white" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[var(--color-bg-base)] animate-pulse" />
          {/* Tooltip */}
          <div className="absolute right-20 bg-slate-900 text-white text-[10px] font-bold px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl">
            <span className="text-amber-400">BLANC MODE</span> - Creative Director
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="w-[460px] h-[700px] bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl shadow-[0_20px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="p-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white flex justify-between items-center border-b border-white/5 shrink-0 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(251,146,60,0.3)]">
                <Zap className="w-5 h-5 fill-white text-white" />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-tight">Blanc Mode</h3>
                <p className="text-[10px] text-amber-400/80 font-bold tracking-wide">CREATIVE DIRECTOR - AI INTELLIGENCE</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Category Selector */}
          <div className="p-2 bg-[var(--color-bg-surface)] flex gap-1.5 border-b border-[var(--color-border-default)] shrink-0">
            {[
              { id: 'bad_output', label: 'Bad Output', icon: AlertCircle, desc: 'Content sucks' },
              { id: 'new_info', label: 'Brand Intel', icon: Brain, desc: 'New context' },
              { id: 'suggestion', label: 'Suggestion', icon: MessageCircle, desc: 'Got an idea' },
            ].map(cat => (
              <button 
                key={cat.id} 
                onClick={() => setCategory(cat.id as any)}
                className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-center transition-all ${
                  category === cat.id 
                    ? 'bg-gradient-to-b from-amber-500/20 to-orange-500/10 text-amber-400 border border-amber-500/30 shadow-sm' 
                    : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] border border-transparent'
                }`}
              >
                <cat.icon className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-wider">{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] space-y-2`}>
                  {m.role === 'ai' && (
                    <div className="flex items-center gap-1.5 px-1">
                      <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      <span className="text-[8px] font-black text-amber-400/60 uppercase tracking-widest">Blanc Mode</span>
                    </div>
                  )}
                  
                  {/* Attachment Previews (user messages) */}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {m.attachments.map(att => (
                        <div key={att.id} className="rounded-xl overflow-hidden border border-white/10">
                          {att.type === 'image' ? (
                            <img src={att.url} alt={att.name} className="w-24 h-24 object-cover" />
                          ) : (
                            <div className="w-24 h-16 flex flex-col items-center justify-center gap-1 bg-[var(--color-bg-hover)] px-2">
                              <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
                              <span className="text-[8px] font-bold text-[var(--color-text-muted)] truncate max-w-full">{att.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`p-4 rounded-2xl text-[13px] font-medium leading-relaxed ${
                    m.role === 'user' 
                      ? 'bg-[var(--color-accent-600)] text-white rounded-br-sm' 
                      : 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded-bl-sm'
                  }`}>
                    {m.isVoice && (
                      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-white/10">
                        <Mic className="w-3 h-3 text-amber-300" />
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-300/80">Voice Note</span>
                      </div>
                    )}
                    {m.content}
                  </div>
                  {m.actionTaken && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg w-fit">
                      <Brain className="w-2.5 h-2.5 text-emerald-400" />
                      <span className="text-[9px] font-bold text-emerald-400">{m.actionTaken}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400 animate-pulse" />
                    <span className="text-[8px] font-black text-amber-400/60 uppercase tracking-widest">Blanc Mode is thinking...</span>
                  </div>
                  <div className="bg-[var(--color-bg-surface)] p-4 rounded-2xl rounded-bl-sm border border-[var(--color-border-subtle)]">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Attachment Preview Strip */}
          {attachments.length > 0 && (
            <div className="px-3 py-2 bg-[var(--color-bg-surface)] border-t border-[var(--color-border-default)] flex gap-2 overflow-x-auto shrink-0">
              {attachments.map(att => (
                <div key={att.id} className="relative group shrink-0">
                  {att.type === 'image' ? (
                    <img src={att.url} alt={att.name} className="w-14 h-14 rounded-xl object-cover border border-[var(--color-border-default)]" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-hover)] flex flex-col items-center justify-center gap-0.5">
                      <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
                      <span className="text-[7px] font-bold text-[var(--color-text-muted)] truncate max-w-[48px]">{att.name.split('.').pop()}</span>
                    </div>
                  )}
                  <button 
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Voice Recording Banner */}
          {isRecording && (
            <div className="px-4 py-3 bg-gradient-to-r from-red-950/80 to-orange-950/80 border-t border-red-500/20 flex items-center gap-3 shrink-0">
              <div className="relative">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-30" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-red-400 uppercase tracking-widest">Recording</span>
                  <span className="text-xs font-bold text-red-300 font-mono">{formatTime(recordingTime)}</span>
                </div>
                {/* Audio Level Bars */}
                <div className="flex gap-0.5 mt-1.5 h-3 items-end">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div 
                      key={i} 
                      className="w-1 bg-amber-400 rounded-full transition-all duration-75" 
                      style={{ 
                        height: `${Math.max(2, Math.min(12, audioLevel * 12 * (0.5 + Math.random() * 0.5)))}px`,
                        opacity: audioLevel > 0.05 ? 0.6 + Math.random() * 0.4 : 0.2
                      }} 
                    />
                  ))}
                </div>
              </div>
              <button 
                onClick={stopRecording}
                className="w-10 h-10 bg-red-500 hover:bg-red-400 rounded-xl flex items-center justify-center transition-colors shadow-lg"
              >
                <Square className="w-4 h-4 text-white fill-white" />
              </button>
            </div>
          )}

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-3 bg-[var(--color-bg-surface)] border-t border-[var(--color-border-default)] shrink-0">
            <div className="flex items-center gap-1.5 bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-2xl p-1.5 focus-within:border-amber-500/40 transition-all">
              {/* Attachment Button */}
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-amber-400 hover:bg-amber-500/10 transition-all shrink-0"
                title="Attach files"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input 
                ref={fileInputRef}
                type="file" 
                multiple 
                accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.ppt,.pptx"
                className="hidden"
                onChange={handleFileSelect}
              />

              <input 
                ref={inputRef}
                type="text" 
                value={input} 
                onChange={e => setInput(e.target.value)}
                placeholder={
                  isRecording ? 'Recording voice...' :
                  category === 'bad_output' ? "What went wrong? Be specific..." :
                  category === 'new_info' ? "Drop the intel..." :
                  "Your idea..."
                }
                disabled={isRecording}
                className="flex-1 bg-transparent border-none outline-none px-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] disabled:opacity-40"
              />

              {/* Voice Button */}
              <button 
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTyping}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                  isRecording 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'text-[var(--color-text-muted)] hover:text-amber-400 hover:bg-amber-500/10'
                } disabled:opacity-30`}
                title={isRecording ? "Stop recording" : "Record voice note"}
              >
                {isRecording ? <Square className="w-4 h-4 fill-white" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Send Button */}
              <button 
                type="submit" 
                disabled={(!input.trim() && attachments.length === 0) || isTyping || isRecording}
                className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-30 active:scale-95 shadow-lg shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-2">
              <p className="text-[8px] text-[var(--color-text-tertiary)] font-bold uppercase tracking-[0.15em]">
                {messageCount > 0 ? `${messageCount} exchange${messageCount > 1 ? 's' : ''} this session` : 'Director override active'}
              </p>
              <p className="text-[8px] text-amber-400/50 font-bold uppercase tracking-[0.15em]">
                {activeBrand.brandInfo?.aiKnowledgeBase?.length || 0} rules learned
              </p>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
