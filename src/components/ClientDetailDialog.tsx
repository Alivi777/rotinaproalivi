import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Phone, CheckCircle2, Clock, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type Note = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  assigned_to: string;
  completed_at: string | null;
};
type Profile = { user_id: string; display_name: string | null };

export default function ClientDetailDialog({
  clientId,
  clientName,
  clientPhone,
  open,
  onOpenChange,
  profiles,
  defaultAssignee,
}: {
  clientId: string | null;
  clientName: string;
  clientPhone?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: Profile[];
  defaultAssignee: string | null;
}) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newNote, setNewNote] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDate, setNewTaskDate] = useState<Date | undefined>(new Date());
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>("");

  useEffect(() => {
    if (defaultAssignee) setNewTaskAssignee(defaultAssignee);
    else if (user) setNewTaskAssignee(user.id);
  }, [defaultAssignee, user]);

  async function load() {
    if (!clientId) return;
    const [n, t] = await Promise.all([
      supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_tasks")
        .select("*")
        .eq("client_id", clientId)
        .order("due_date", { ascending: true }),
    ]);
    setNotes((n.data ?? []) as Note[]);
    setTasks((t.data ?? []) as Task[]);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  async function addNote() {
    if (!newNote.trim() || !clientId || !user) return;
    const { error } = await supabase.from("client_notes").insert({
      client_id: clientId,
      author_id: user.id,
      body: newNote.trim(),
    });
    if (error) return toast.error(error.message);
    setNewNote("");
    load();
  }

  async function addTask() {
    if (!newTaskTitle.trim() || !newTaskDate || !clientId || !user) return;
    const assignee = newTaskAssignee || user.id;
    const { error } = await supabase.from("client_tasks").insert({
      client_id: clientId,
      assigned_to: assignee,
      created_by: user.id,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim() || null,
      due_date: format(newTaskDate, "yyyy-MM-dd"),
    });
    if (error) return toast.error(error.message);
    toast.success("Tarefa criada — aparecerá na rotina do responsável");
    setNewTaskTitle("");
    setNewTaskDesc("");
    load();
  }

  async function toggleTask(t: Task) {
    if (!user) return;
    const { error } = await supabase
      .from("client_tasks")
      .update({
        completed_at: t.completed_at ? null : new Date().toISOString(),
        completed_by: t.completed_at ? null : user.id,
      })
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    load();
  }

  const nameOf = (uid: string) =>
    profiles.find((p) => p.user_id === uid)?.display_name || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientName}</DialogTitle>
          {clientPhone && (
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> {clientPhone}
            </div>
          )}
        </DialogHeader>

        <Tabs defaultValue="tasks">
          <TabsList className="w-full">
            <TabsTrigger value="tasks" className="flex-1">
              Tarefas ({tasks.filter((t) => !t.completed_at).length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Histórico ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-4 mt-4">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Nova tarefa
              </div>
              <Input
                placeholder="O que precisa ser feito?"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <Textarea
                placeholder="Detalhes (opcional)"
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                rows={2}
              />
              <div className="grid sm:grid-cols-2 gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !newTaskDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newTaskDate
                        ? format(newTaskDate, "PPP", { locale: ptBR })
                        : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newTaskDate}
                      onSelect={setNewTaskDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Select value={newTaskAssignee} onValueChange={setNewTaskAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.display_name || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addTask} size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Adicionar tarefa
              </Button>
              <p className="text-xs text-muted-foreground">
                A tarefa aparecerá automaticamente na rotina do responsável na
                data marcada.
              </p>
            </div>

            <ul className="space-y-2">
              {tasks.length === 0 && (
                <li className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma tarefa ainda.
                </li>
              )}
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "p-3 rounded-lg border border-border/50 flex items-start gap-3",
                    t.completed_at && "opacity-50"
                  )}
                >
                  <button
                    onClick={() => toggleTask(t)}
                    className="mt-0.5 text-muted-foreground hover:text-primary transition-smooth"
                  >
                    <CheckCircle2
                      className={cn(
                        "h-5 w-5",
                        t.completed_at && "text-primary fill-primary/20"
                      )}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "font-medium text-sm",
                        t.completed_at && "line-through"
                      )}
                    >
                      {t.title}
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {format(new Date(t.due_date + "T00:00:00"), "dd/MM/yyyy")}
                      <span>· {nameOf(t.assigned_to)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4 mt-4">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
              <Label>Nova observação</Label>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Anote o que aconteceu…"
                rows={3}
              />
              <Button onClick={addNote} size="sm" className="w-full">
                Registrar observação
              </Button>
            </div>
            <ul className="space-y-2">
              {notes.length === 0 && (
                <li className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma observação ainda.
                </li>
              )}
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="p-3 rounded-lg border border-border/50 bg-card"
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {format(new Date(n.created_at), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}{" "}
                    · {nameOf(n.author_id)}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
