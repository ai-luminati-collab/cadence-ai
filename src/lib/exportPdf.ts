import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Captures an HTML element and exports it as a multi-page PDF.
 * @param elementId The ID of the HTML element to capture.
 * @param filename The name of the downloaded PDF file.
 */
export async function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with ID ${elementId} not found.`);
    return;
  }

  // To prevent the scrollbars and clipped content from affecting the screenshot,
  // we temporarily stash current styles and apply print-friendly styles.
  const originalStyle = element.getAttribute('style') || '';
  const originalWidth = element.style.width;
  const originalHeight = element.style.height;
  const originalOverflow = element.style.overflow;
  
  element.style.width = '1200px'; 
  element.style.height = 'auto';
  element.style.overflow = 'visible';

  try {
    // Generate a high-quality canvas from the DOM element
    const canvas = await html2canvas(element, {
      scale: 2, // High DPI for better quality
      useCORS: true, 
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight
    });

    const imgData = canvas.toDataURL('image/png');
    
    // Calculate dimensions for A4 PDF page (210mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    // Canvas dimensions converted to mm
    const imgProps = pdf.getImageProperties(imgData);
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Add the first page
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    // If the image is taller than one A4 page, add new pages
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(filename);
  } catch (error) {
    console.error("PDF generation failed:", error);
  } finally {
    // Restore original styles
    element.setAttribute('style', originalStyle);
    element.style.width = originalWidth;
    element.style.height = originalHeight;
    element.style.overflow = originalOverflow;
  }
}
