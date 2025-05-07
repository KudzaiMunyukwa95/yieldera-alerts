// alertController.js - Controller for alert-related API endpoints

// ... [unchanged code above]

// Send email notification
async function sendEmailNotification(recipients, subject, message) {
  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
    to: Array.isArray(recipients) ? recipients.join(', ') : recipients,
    subject: subject,
    text: message,
    html: message.replace(/\n/g, '<br>')
  };

  const info = await emailTransporter.sendMail(mailOptions);
  console.log(`Email sent: ${info.messageId}`);
  return info;
}

// ... [rest of the unchanged code]