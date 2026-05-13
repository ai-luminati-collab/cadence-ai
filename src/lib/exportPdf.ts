import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Export element not found');
  }

  const scrollParent = element.closest('[class*="overflow-y"]') as HTMLElement | null;
  const originalScrollTop = scrollParent?.scrollTop ?? 0;
  if (scrollParent) scrollParent.scrollTop = 0;

  const originalStyle = element.getAttribute('style') || '';
  element.style.width = '1200px';
  element.style.height = 'auto';
  element.style.overflow = 'visible';
  element.style.position = 'relative';

  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-base').trim() || '#0a0a0f';

  try {
    await new Promise(r => setTimeout(r, 100));

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: bgColor.startsWith('#') ? bgColor : `#${bgColor}`,
      windowWidth: 1200,
      windowHeight: element.scrollHeight,
      onclone: (clonedDoc) => {
        const root = clonedDoc.documentElement;
        const srcRoot = document.documentElement;
        const vars = getComputedStyle(srcRoot);
        const cssVarNames = [
          '--color-bg-base', '--color-bg-card', '--color-bg-input', '--color-bg-hover',
          '--color-text-primary', '--color-text-secondary', '--color-text-muted', '--color-text-tertiary',
          '--color-border-default', '--color-accent-300', '--color-accent-400', '--color-accent-500',
          '--color-accent-600', '--color-accent-700',
        ];
        for (const v of cssVarNames) {
          root.style.setProperty(v, vars.getPropertyValue(v));
        }
      },
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(filename);
  } finally {
    element.setAttribute('style', originalStyle);
    if (scrollParent) scrollParent.scrollTop = originalScrollTop;
  }
}
