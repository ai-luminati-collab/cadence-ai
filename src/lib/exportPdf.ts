import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with ID ${elementId} not found.`);
    alert('Export failed: could not find the strategy content on the page.');
    return;
  }

  const originalStyle = element.getAttribute('style') || '';

  // Force light background and resolved colors for html2canvas
  element.style.width = '1200px';
  element.style.height = 'auto';
  element.style.overflow = 'visible';
  element.style.color = '#1a1a2e';
  element.style.background = '#ffffff';

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
      windowHeight: element.scrollHeight,
      onclone: (clonedDoc) => {
        // Resolve CSS variables in the cloned document so html2canvas can read them
        const root = clonedDoc.documentElement;
        root.style.setProperty('--color-text-primary', '#1a1a2e');
        root.style.setProperty('--color-text-secondary', '#4a4a6a');
        root.style.setProperty('--color-text-muted', '#8888a8');
        root.style.setProperty('--color-text-tertiary', '#aaaacc');
        root.style.setProperty('--color-bg-base', '#ffffff');
        root.style.setProperty('--color-bg-surface', '#f8f9fc');
        root.style.setProperty('--color-bg-elevated', '#f0f1f5');
        root.style.setProperty('--color-bg-hover', '#eeeef4');
        root.style.setProperty('--color-bg-input', '#f5f5fa');
        root.style.setProperty('--color-border-default', '#e2e2ee');
        root.style.setProperty('--color-border-subtle', '#ececf4');
        root.style.setProperty('--color-border-hover', '#d0d0e0');
        root.style.setProperty('--color-accent-400', '#6366f1');
        root.style.setProperty('--color-accent-500', '#4f46e5');
        root.style.setProperty('--color-accent-600', '#4338ca');
        root.style.setProperty('--color-accent-700', '#3730a3');
        root.style.setProperty('--color-accent-900', '#1e1b4b');
        root.style.setProperty('--color-accent-glow', 'rgba(99,102,241,0.15)');
      }
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgProps = pdf.getImageProperties(imgData);
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(filename);
  } catch (error) {
    console.error("PDF generation failed:", error);
    alert('PDF export failed. Check the browser console for details.');
  } finally {
    element.setAttribute('style', originalStyle);
  }
}
