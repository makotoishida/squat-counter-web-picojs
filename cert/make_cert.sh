#!/bin/bash

openssl genpkey -algorithm ec -pkeyopt ec_paramgen_curve:prime256v1 -out localhost.key
openssl req -new -sha256 -subj /CN=localhost -key localhost.key -out localhost.csr
openssl x509 -req -signkey localhost.key -in localhost.csr -out localhost.crt
