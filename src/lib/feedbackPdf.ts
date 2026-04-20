import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type FeedbackRecord = {
  id: string;
  feedback_type: "contract" | "feedback";
  reference_date: string;
  week_of_month: number;
  reference_month: string;
  role: string | null;
  department: string | null;
  period_start: string | null;
  period_end: string | null;
  next_alignment_date: string | null;
  last_week_numbers: string | null;
  last_week_conversion: string | null;
  last_week_organization: string | null;
  last_week_closings: string | null;
  last_week_behavior: string | null;
  last_week_hit_goal: string | null;
  last_week_focus_energy: string | null;
  needs_improvement: string | null;
  commitment_meetings: string | null;
  commitment_goal: string | null;
  commitment_how: string | null;
  attitude_1: string | null;
  attitude_2: string | null;
  attitude_3: string | null;
  observation: string | null;
  deliverables: string | null;
  expected_behavior: string | null;
  non_negotiables: string | null;
  closing_message: string | null;
  manager_signed_at: string | null;
  manager_signature_name: string | null;
  collaborator_signed_at: string | null;
  collaborator_signature_name: string | null;
  collaborator_response: string | null;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "______________";

const fmtDateTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

export function exportFeedbackPdf(
  fb: FeedbackRecord,
  collaboratorName: string,
  managerName: string
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  const isContract = fb.feedback_type === "contract";

  // Header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(
    isContract ? "Contrato de Expectativa" : "Feedback Semanal",
    margin,
    35
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Semana ${fb.week_of_month} · ${new Date(fb.reference_month).toLocaleDateString(
      "pt-BR",
      { month: "long", year: "numeric" }
    )}`,
    margin,
    55
  );

  doc.setTextColor(0, 0, 0);
  let y = 95;

  // Header info table
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [241, 245, 249], textColor: 30 },
    body: [
      ["Colaborador", collaboratorName, "Gestor", managerName],
      [
        "Departamento",
        fb.department || "-",
        "Cargo",
        fb.role || "-",
      ],
      [
        "Início",
        fmtDate(fb.period_start),
        "Fim",
        fmtDate(fb.period_end),
      ],
      [
        "Data de referência",
        fmtDate(fb.reference_date),
        "Próximo alinhamento",
        fmtDate(fb.next_alignment_date),
      ],
    ],
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 110 },
      2: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 110 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 16;

  if (isContract) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      head: [["Entregáveis / Metas", "Comportamento / Atitude", "Inegociáveis"]],
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      body: [
        [
          fb.deliverables || "-",
          fb.expected_behavior || "-",
          fb.non_negotiables || "-",
        ],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    if (fb.closing_message) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      const lines = doc.splitTextToSize(
        fb.closing_message,
        pageWidth - margin * 2
      );
      doc.text(lines, margin, y);
      y += lines.length * 11 + 10;
    } else {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      const defaultMsg =
        "Espero que as expectativas acima alinhadas possam ser cumpridas com responsabilidade, a fim de mantermos a qualidade em nossos serviços prestados, buscando sempre o desenvolvimento e novas metas.";
      const lines = doc.splitTextToSize(defaultMsg, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 11 + 10;
    }
  } else {
    // Weekly feedback layout
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      head: [["Análise da última semana", ""]],
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      body: [
        ["Números", fb.last_week_numbers || "-"],
        ["Conversão", fb.last_week_conversion || "-"],
        ["Organização", fb.last_week_organization || "-"],
        ["Fechamentos", fb.last_week_closings || "-"],
        ["Comportamento", fb.last_week_behavior || "-"],
        ["Atingiu a meta?", fb.last_week_hit_goal || "-"],
        ["Foco e energia", fb.last_week_focus_energy || "-"],
        ["O que precisa aprimorar", fb.needs_improvement || "-"],
      ],
      columnStyles: {
        0: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 160 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      head: [["Compromisso da semana", ""]],
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      body: [
        ["Nº de reuniões necessárias", fb.commitment_meetings || "-"],
        ["Meta da semana", fb.commitment_goal || "-"],
        ["O que fará para atingir", fb.commitment_how || "-"],
        ["Atitude 1 (indicador)", fb.attitude_1 || "-"],
        ["Atitude 2 (indicador)", fb.attitude_2 || "-"],
        ["Atitude 3 (indicador)", fb.attitude_3 || "-"],
      ],
      columnStyles: {
        0: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 160 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // Observation
  if (fb.observation) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      head: [["Observação e acordo"]],
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      body: [[fb.observation]],
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // Collaborator response
  if (fb.collaborator_response) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      head: [["Resposta do colaborador"]],
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      body: [[fb.collaborator_response]],
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // Signatures
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 140) {
    doc.addPage();
    y = margin;
  } else {
    y = Math.max(y, pageHeight - 140);
  }

  const colW = (pageWidth - margin * 2 - 30) / 2;
  const sigY = y + 40;
  doc.setDrawColor(100);
  doc.line(margin, sigY, margin + colW, sigY);
  doc.line(margin + colW + 30, sigY, margin + colW * 2 + 30, sigY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Colaborador", margin, sigY + 14);
  doc.text("Gestor", margin + colW + 30, sigY + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    fb.collaborator_signature_name || collaboratorName,
    margin,
    sigY + 28
  );
  doc.text(
    fb.manager_signature_name || managerName,
    margin + colW + 30,
    sigY + 28
  );

  doc.setTextColor(100);
  doc.setFontSize(8);
  doc.text(
    fb.collaborator_signed_at
      ? `Assinado em ${fmtDateTime(fb.collaborator_signed_at)}`
      : "Pendente de assinatura",
    margin,
    sigY + 42
  );
  doc.text(
    fb.manager_signed_at
      ? `Assinado em ${fmtDateTime(fb.manager_signed_at)}`
      : "Pendente de assinatura",
    margin + colW + 30,
    sigY + 42
  );

  const filename = `${isContract ? "contrato" : "feedback"}-${collaboratorName.replace(/\s+/g, "_")}-S${fb.week_of_month}-${fb.reference_date}.pdf`;
  doc.save(filename);
}
