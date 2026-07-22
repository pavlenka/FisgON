import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Contact } from "../api";

interface ContactForm {
  name: string;
  email: string;
}

const EMPTY_FORM: ContactForm = { name: "", email: "" };

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const { data: contacts } = useQuery({ queryKey: ["contacts"], queryFn: api.listContacts });
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () =>
      editing ? api.updateContact(editing.id, form) : api.createContact(form),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setEditing(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteContact,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
    onError: (e: Error) => setError(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    saveMut.mutate();
  }

  function startEdit(contact: Contact) {
    setEditing(contact);
    setForm({ name: contact.name, email: contact.email });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="contacts">
      <section className="card add-contact">
        <h2>{editing ? "Editar contacto" : "Añadir contacto"}</h2>
        <p className="muted">Guarda las personas a las que quieres enviar noticias por correo.</p>
        <form className="contact-form" onSubmit={submit}>
          <label>
            Nombre
            <input
              value={form.name}
              placeholder="p. ej. Ana"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Correo electrónico
            <input
              type="email"
              value={form.email}
              placeholder="ana@ejemplo.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button disabled={!form.name.trim() || !form.email.trim() || saveMut.isPending}>
              {saveMut.isPending ? "Guardando…" : editing ? "Guardar cambios" : "Añadir contacto"}
            </button>
            {editing && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setEditing(null);
                  setForm(EMPTY_FORM);
                  setError(null);
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="contact-list">
        <h2>Tus contactos</h2>
        {contacts && contacts.length === 0 && <p className="muted">Aún no has añadido ningún contacto.</p>}
        {contacts?.map((contact) => (
          <div className="card contact-item" key={contact.id}>
            <div>
              <div className="contact-name">{contact.name}</div>
              <div className="muted">{contact.email || "Falta el correo: edita este contacto"}</div>
            </div>
            <div className="contact-actions">
              <button onClick={() => startEdit(contact)}>Editar</button>
              <button
                className="danger"
                disabled={deleteMut.isPending}
                onClick={() => confirm(`¿Borrar a ${contact.name}?`) && deleteMut.mutate(contact.id)}
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}