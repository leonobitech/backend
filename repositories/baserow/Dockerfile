# Dockerfile para Baserow con 0.0.0.0
FROM baserow/baserow:1.33.3

# Sobreescribimos el comando de arranque para cambiar gunicorn a 0.0.0.0
# El comando original es: gunicorn --bind 127.0.0.1:8000 baserow.wsgi:application

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "baserow.wsgi:application"]
