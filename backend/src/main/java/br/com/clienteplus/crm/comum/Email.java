package br.com.clienteplus.crm.comum;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.mail.Message;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

/**
 * E-mail pelo SMTP configurado pela loja (Configurações → E-mail) ou, para
 * mensagens do sistema (recuperar senha), pelo SMTP da plataforma (Admin).
 */
@ApplicationScoped
public class Email {

  @Inject Db db;
  @Inject Cripto cripto;

  public boolean configurado(UUID storeId) {
    return Json.s(smtp(storeId), "host") != null;
  }

  public boolean plataformaConfigurada() {
    return Json.s(smtpPlataforma(), "host") != null;
  }

  private Map<String, Object> smtp(UUID storeId) {
    return Json.m(Json.m(db.valor("select config from crm_lojas where id = ?", storeId)).get("smtp"));
  }

  private Map<String, Object> smtpPlataforma() {
    return Json.m(Json.m(db.valor("select config from crm_plataforma where id = 1")).get("smtp"));
  }

  public void enviar(UUID storeId, String para, String assunto, String html) {
    Map<String, Object> s = smtp(storeId);
    if (Json.s(s, "host") == null) throw Erro.requisicao("Configure o e-mail (SMTP) em Configurações → E-mail");
    enviarCom(s, para, assunto, html);
  }

  public void enviarPlataforma(String para, String assunto, String html) {
    Map<String, Object> s = smtpPlataforma();
    if (Json.s(s, "host") == null) throw Erro.requisicao("O e-mail da plataforma não foi configurado");
    enviarCom(s, para, assunto, html);
  }

  private void enviarCom(Map<String, Object> s, String para, String assunto, String html) {
    String host = Json.s(s, "host");
    if (para == null || !para.contains("@")) throw Erro.requisicao("E-mail do destinatário inválido");
    Properties p = new Properties();
    int porta = Json.i(s, "porta", 587);
    p.put("mail.smtp.host", host);
    p.put("mail.smtp.port", String.valueOf(porta));
    p.put("mail.smtp.auth", "true");
    p.put("mail.smtp.connectiontimeout", "15000");
    p.put("mail.smtp.timeout", "30000");
    if (porta == 465) p.put("mail.smtp.ssl.enable", "true");
    else p.put("mail.smtp.starttls.enable", "true");
    String usuario = Json.s(s, "usuario");
    String senha = cripto.decifrar(Json.s(s, "senha_cripto"));
    Session sessao = Session.getInstance(p, new jakarta.mail.Authenticator() {
      @Override
      protected PasswordAuthentication getPasswordAuthentication() {
        return new PasswordAuthentication(usuario, senha);
      }
    });
    try {
      MimeMessage m = new MimeMessage(sessao);
      m.setFrom(new InternetAddress(Json.s(s, "remetente", usuario), Json.s(s, "nome_remetente", ""), StandardCharsets.UTF_8.name()));
      m.setRecipients(Message.RecipientType.TO, InternetAddress.parse(para));
      m.setSubject(assunto, StandardCharsets.UTF_8.name());
      m.setContent(html, "text/html; charset=UTF-8");
      Transport.send(m);
    } catch (Exception e) {
      throw Erro.servico("Falha ao enviar e-mail: " + e.getMessage());
    }
  }
}
