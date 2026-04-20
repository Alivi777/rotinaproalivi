import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ContactRow = {
  external_id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  last_appointment_at?: string | null;
  tags?: string[] | null;
  notes?: string | null;
};

export type ParsedContact = ContactRow & { _row: number; _errors: string[] };

const HEADER_MAP: Record<string, keyof ContactRow> = {
  id_clinicorp: "external_id",
  external_id: "external_id",
  codigo: "external_id",
  nome: "name",
  name: "name",
  telefone: "phone",
  celular: "phone",
  phone: "phone",
  email: "email",
  "e-mail": "email",
  cpf: "cpf",
  data_nascimento: "birth_date",
  nascimento: "birth_date",
  birth_date: "birth_date",
  endereco: "address",
  endereço: "address",
  address: "address",
  cidade: "city",
  city: "city",
  estado: "state",
  uf: "state",
  state: "state",
  cep: "zip_code",
  zip_code: "zip_code",
  ultima_consulta: "last_appointment_at",
  última_consulta: "last_appointment_at",
  last_appointment_at: "last_appointment_at",
  tags: "tags",
  observacoes: "notes",
  observações: "notes",
  notes: "notes",
};

function normalizeKey(k: string): string {
  return k
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function parseDateBR(v: string): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // dd/mm/yyyy
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial-ish or other → try Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function cleanDigits(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).replace(/\D/g, "");
  return d || null;
}

function mapRow(raw: Record<string, unknown>, idx: number): ParsedContact {
  const out: ParsedContact = { name: "", _row: idx + 2, _errors: [] };
  for (const key of Object.keys(raw)) {
    const mapped = HEADER_MAP[normalizeKey(key)];
    if (!mapped) continue;
    const value = raw[key];
    const str = value == null ? "" : String(value).trim();
    if (mapped === "tags") {
      out.tags = str
        ? str.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
        : null;
    } else if (mapped === "phone") {
      out.phone = str || null;
    } else if (mapped === "cpf") {
      out.cpf = cleanDigits(str);
    } else if (mapped === "birth_date" || mapped === "last_appointment_at") {
      out[mapped] = parseDateBR(str);
    } else {
      (out as Record<string, unknown>)[mapped] = str || null;
    }
  }
  if (!out.name) out._errors.push("Nome obrigatório");
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))
    out._errors.push("E-mail inválido");
  if (out.cpf && out.cpf.length !== 11) out._errors.push("CPF deve ter 11 dígitos");
  if (out.phone && cleanDigits(out.phone)!.length < 10)
    out._errors.push("Telefone inválido");
  return out;
}

export async function parseFile(file: File): Promise<ParsedContact[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || file.type === "text/csv") {
    const text = await file.text();
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",
    });
    return (result.data || []).map(mapRow);
  }
  // xlsx / xls
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: "",
  });
  return rows.map(mapRow);
}

export const CSV_TEMPLATE_HEADERS = [
  "id_clinicorp",
  "nome",
  "telefone",
  "email",
  "cpf",
  "data_nascimento",
  "endereco",
  "cidade",
  "estado",
  "cep",
  "ultima_consulta",
  "tags",
  "observacoes",
];

export function downloadCsvTemplate() {
  const sample = [
    [
      "12345",
      "Maria Silva",
      "(11) 98765-4321",
      "maria@exemplo.com",
      "123.456.789-00",
      "15/03/1985",
      "Rua das Flores, 123",
      "São Paulo",
      "SP",
      "01234-567",
      "10/10/2024",
      "vip;ortodontia",
      "Cliente recorrente",
    ],
    [
      "12346",
      "João Souza",
      "11987654322",
      "joao@exemplo.com",
      "98765432100",
      "22/07/1990",
      "Av. Paulista, 1000",
      "São Paulo",
      "SP",
      "01310-100",
      "05/09/2024",
      "implante",
      "",
    ],
  ];
  const csv = Papa.unparse({ fields: CSV_TEMPLATE_HEADERS, data: sample });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo_contatos_clinicorp.csv";
  a.click();
  URL.revokeObjectURL(url);
}
