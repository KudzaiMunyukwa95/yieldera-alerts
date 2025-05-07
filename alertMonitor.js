// alertMonitor.js - Backend service for monitoring alerts

// ... [unchanged code above]

// Send email notification
async function sendEmailNotification(alert, message) {
  const recipients = alert.notificationEmails.split(',').map(email => email.trim()).filter(email => email);

  if (recipients.length === 0) {
    console.log(`No valid email recipients for alert ${alert.id}`);
    return;
  }

  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
    to: recipients.join(', '),
    subject: `ALERT: ${alert.name}`,
    text: message,
    html: message.replace(/\n/g, '<br>')
  };

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending email notification:', error);
    return false;
  }
}

// ... [rest of the unchanged code]